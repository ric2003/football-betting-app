import { PlayerProfile } from "@/app/ui/player-profile";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <PlayerProfile userId={userId} />;
}
