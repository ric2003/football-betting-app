#!/usr/bin/env python3
"""Extract FIFA World Cup squad list players from the official PDF to JSON."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import pdfplumber
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: pdfplumber. Install it with "
        "`python3 -m pip install -r scripts/requirements.txt`."
    ) from exc

logging.getLogger("pdfminer").setLevel(logging.ERROR)


REQUIRED_COLUMNS = (
    "#",
    "POS",
    "PLAYER NAME",
    "FIRST NAME(S)",
    "LAST NAME(S)",
    "NAME ON SHIRT",
    "DOB",
    "CLUB",
    "HEIGHT (CM)",
)

POSITION_LABELS = {
    "GK": "Goalkeeper",
    "DF": "Defender",
    "MF": "Midfielder",
    "FW": "Forward",
}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\x00", "").split()).strip()


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def parse_pdf_date(value: str) -> dt.date:
    return dt.datetime.strptime(value, "%d/%m/%Y").date()


def parse_iso_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def header_indexes(header: Iterable[Any]) -> Dict[str, int]:
    indexes: Dict[str, int] = {}
    for index, cell in enumerate(header):
        label = clean_text(cell).upper()
        if label:
            indexes[label] = index
    missing = [column for column in REQUIRED_COLUMNS if column not in indexes]
    if missing:
        raise ValueError(f"missing required table column(s): {', '.join(missing)}")
    return indexes


def cell(row: List[Any], indexes: Dict[str, int], key: str) -> str:
    index = indexes[key]
    if index >= len(row):
        return ""
    return clean_text(row[index])


def extract_team(text: str, page_number: int) -> Tuple[str, str]:
    match = re.search(r"^(.+?) \(([A-Z]{3})\)$", text, re.MULTILINE)
    if not match:
        raise ValueError(f"page {page_number}: could not find team name/code")
    return clean_text(match.group(1)), clean_text(match.group(2))


def extract_competition_metadata(text: str) -> Dict[str, Optional[str]]:
    lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
    competition = None
    date_range = None
    for line in lines:
        if "World Cup" in line:
            competition = line
        if re.search(r"\d{1,2} [A-Za-z]+ 20\d{2}.*\d{1,2} [A-Za-z]+ 20\d{2}", line):
            date_range = line
    return {
        "competition": competition,
        "dateRange": date_range,
    }


def split_club_country(club: str) -> Tuple[str, Optional[str]]:
    match = re.match(r"^(.*?)\s+\(([A-Z]{3})\)$", club)
    if not match:
        return club, None
    return clean_text(match.group(1)), clean_text(match.group(2))


def extract_pdf(pdf_path: Path, youth_cutoff: dt.date) -> Dict[str, Any]:
    teams: List[Dict[str, Any]] = []
    players: List[Dict[str, Any]] = []
    warnings: List[str] = []
    metadata: Dict[str, Any] = {}

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_index, page in enumerate(pdf.pages):
            page_number = page_index + 1
            text = page.extract_text() or ""
            if page_number == 1:
                metadata.update(extract_competition_metadata(text))

            team_name, team_code = extract_team(text, page_number)
            team_slug = slugify(team_name)
            teams.append(
                {
                    "name": team_name,
                    "code": team_code,
                    "slug": team_slug,
                }
            )

            tables = page.extract_tables()
            if not tables:
                raise ValueError(f"page {page_number}: no table found")
            table = tables[0]
            if not table:
                raise ValueError(f"page {page_number}: empty table")

            indexes = header_indexes(table[0])
            team_player_count = 0
            for row in table[1:]:
                if not row or not cell(row, indexes, "#").isdigit():
                    continue

                raw_values = [str(value) for value in row if value is not None]
                if any("\x00" in value for value in raw_values):
                    warnings.append(
                        f"page {page_number} {team_code} #{cell(row, indexes, '#')}: "
                        "removed embedded NUL character(s) from PDF text"
                    )

                squad_number = int(cell(row, indexes, "#"))
                date_of_birth = parse_pdf_date(cell(row, indexes, "DOB"))
                club_with_country = cell(row, indexes, "CLUB")
                club_name, club_country_code = split_club_country(club_with_country)
                height_value = cell(row, indexes, "HEIGHT (CM)")
                position = cell(row, indexes, "POS")
                player_name = cell(row, indexes, "PLAYER NAME")
                player_slug = slugify(f"{team_code}-{squad_number}-{player_name}")

                players.append(
                    {
                        "id": player_slug,
                        "name": player_name,
                        "firstNames": cell(row, indexes, "FIRST NAME(S)"),
                        "lastNames": cell(row, indexes, "LAST NAME(S)"),
                        "shirtName": cell(row, indexes, "NAME ON SHIRT"),
                        "squadNumber": squad_number,
                        "position": position,
                        "positionLabel": POSITION_LABELS.get(position, position),
                        "dateOfBirth": date_of_birth.isoformat(),
                        "isYoung": date_of_birth >= youth_cutoff,
                        "teamName": team_name,
                        "teamCode": team_code,
                        "teamSlug": team_slug,
                        "club": club_name,
                        "clubCountryCode": club_country_code,
                        "heightCm": int(height_value) if height_value else None,
                    }
                )
                team_player_count += 1

            if team_player_count != 26:
                raise ValueError(
                    f"page {page_number} {team_code}: expected 26 players, "
                    f"found {team_player_count}"
                )

    player_counts = {team["code"]: 0 for team in teams}
    for player in players:
        player_counts[player["teamCode"]] += 1
    for team in teams:
        team["playerCount"] = player_counts[team["code"]]

    webapp_teams = [
        {
            "name": team["name"],
            "code": team["code"],
            "group": None,
        }
        for team in teams
    ]
    webapp_players = [
        {
            "name": player["shirtName"],
            "teamCode": player["teamCode"],
            "isYoung": player["isYoung"],
        }
        for player in players
    ]

    return {
        "metadata": {
            **metadata,
            "sourcePdf": str(pdf_path),
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "youthCutoff": youth_cutoff.isoformat(),
            "youthRule": f"Born on or after {youth_cutoff.isoformat()}",
            "teamCount": len(teams),
            "playerCount": len(players),
            "youngPlayerCount": sum(1 for player in players if player["isYoung"]),
        },
        "teams": teams,
        "players": players,
        "webapp": {
            "teams": webapp_teams,
            "players": webapp_players,
        },
        "warnings": warnings,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Extract all squad-list players from a PDF into webapp-ready JSON."
    )
    parser.add_argument("pdf", type=Path, help="Path to SquadLists-English.pdf")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("data/squad-list-players.json"),
        help="Output JSON path. Defaults to data/squad-list-players.json.",
    )
    parser.add_argument(
        "--youth-cutoff",
        default="2005-01-01",
        help="ISO date for youth eligibility. Defaults to 2005-01-01.",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Write compact JSON instead of pretty JSON.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    pdf_path = args.pdf.expanduser().resolve()
    output_path = args.output.expanduser()
    if not output_path.is_absolute():
        output_path = Path.cwd() / output_path

    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    data = extract_pdf(pdf_path, parse_iso_date(args.youth_cutoff))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        if args.compact:
            json.dump(data, file, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")

    print(
        "Extracted "
        f"{data['metadata']['playerCount']} players "
        f"({data['metadata']['youngPlayerCount']} youth) "
        f"from {data['metadata']['teamCount']} teams to {output_path}"
    )
    if data["warnings"]:
        print(f"Warnings: {len(data['warnings'])}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
