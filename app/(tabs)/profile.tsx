import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { StatusNote } from "@/components/closet/StatusNote";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/Sheet";
import { useAuth } from "@/hooks/useAuth";
import { useProfileDetails } from "@/hooks/useProfile";
import { friendlyError } from "@/utils/errors";

const GENDER_LABEL: Record<string, string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Nonbinary",
  prefer_not_to_say: "Prefer not to say",
};

/** Account details + sign out. Epic 1 adds editing on top of this. */
export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: profile,
    isPending,
    isError,
    error,
    refetch,
  } = useProfileDetails();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const name = profile?.full_name?.trim() || "Your profile";
  const email = profile?.email ?? user?.email ?? "";

  const onSignOut = async () => {
    setConfirmOpen(false);
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      // Drop every cached query (closet, avatar, profile) so the next
      // account on this device starts clean. The auth gate redirects.
      queryClient.clear();
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="w-full max-w-[640px] self-center px-6 pb-12 pt-4">
        <Text
          accessibilityRole="header"
          className="text-title-1 font-bold text-text"
        >
          Profile
        </Text>

        <View className="mt-6 flex-row items-center gap-4">
          <AvatarPreview size={72} />
          <View className="flex-1">
            <Text
              className="text-title-3 font-semibold text-text"
              numberOfLines={1}
            >
              {name}
            </Text>
            {email ? (
              <Text
                className="mt-0.5 text-footnote text-text-muted"
                numberOfLines={1}
              >
                {email}
              </Text>
            ) : null}
          </View>
        </View>

        {isError && (
          <View className="mt-6">
            <StatusNote
              tone="error"
              message={friendlyError(error, "Couldn't load your profile.")}
              action={{
                label: "Retry",
                onPress: () => refetch(),
                hint: "Reloads your profile",
              }}
            />
          </View>
        )}

        <View className="p-6 mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
          <DetailRow
            label="Gender"
            value={
              profile ? (GENDER_LABEL[profile.gender] ?? profile.gender) : null
            }
            loading={isPending}
          />
          <DetailRow
            label="Location"
            value={
              profile?.location_lat != null && profile.location_lon != null
                ? `${Number(profile.location_lat).toFixed(2)}, ${Number(profile.location_lon).toFixed(2)}`
                : profile
                  ? "Not set"
                  : null
            }
            loading={isPending}
          />
          <DetailRow
            label="Plan"
            value={
              profile
                ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)
                : null
            }
            loading={isPending}
          />
          <DetailRow
            label="Member since"
            value={
              profile ? new Date(profile.created_at).toLocaleDateString() : null
            }
            loading={isPending}
            last
          />
        </View>

        <Button
          testID="profile-sign-out"
          label="Sign out"
          icon={LogOut}
          variant="danger"
          size="lg"
          className="mt-8"
          loading={signingOut}
          onPress={() => setConfirmOpen(true)}
          accessibilityHint="Asks for confirmation before signing you out"
        />
      </ScrollView>

      <ConfirmSheet
        visible={confirmOpen}
        title="Sign out?"
        message="You'll need to sign in again to see your closet and outfits."
        confirmLabel="Sign out"
        destructive
        onConfirm={onSignOut}
        onCancel={() => setConfirmOpen(false)}
      />
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  loading,
  last = false,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-3.5 ${last ? "" : "border-b border-border"}`}
    >
      <Text className="text-callout text-text-muted">{label}</Text>
      {value === null && loading ? (
        <View
          className="h-4 w-24 rounded bg-border"
          accessibilityLabel={`Loading ${label}`}
        />
      ) : (
        <Text className="text-callout text-text">{value ?? "—"}</Text>
      )}
    </View>
  );
}
