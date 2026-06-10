import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { PasswordResetEmail } from "./passwordReset";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      reset: PasswordResetEmail,
      profile(params) {
        const flow = cleanText(params.flow);
        const email = cleanText(params.email).toLowerCase();
        const username = cleanText(params.username);

        if (!email) {
          throw new ConvexError("Indica um email valido.");
        }

        if (flow === "signUp") {
          if (username.length < 3) {
            throw new ConvexError("O username deve ter pelo menos 3 caracteres.");
          }

          return {
            email,
            name: username,
            username,
            isAdmin: false,
          };
        }

        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new ConvexError("A password deve ter pelo menos 8 caracteres.");
        }
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId !== null) {
        return;
      }

      const user = await ctx.db.get(userId);
      const username = user?.username;
      if (username) {
        const usersWithUsername = await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("username"), username))
          .take(2);
        const usernameOwner = usersWithUsername.find(
          (user) => user._id !== userId,
        );
        if (usernameOwner) {
          throw new ConvexError("Username ja existe.");
        }
      }

      const users = await ctx.db.query("users").take(2);
      if (users.length === 1) {
        await ctx.db.patch(userId, { isAdmin: true });
      }
    },
  },
});
