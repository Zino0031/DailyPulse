import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { LogOut, Pencil } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { StatusNote } from "@/components/closet/StatusNote";
import { LookbookSection } from "@/components/outfit/LookbookSection";
import { PlanSection } from "@/components/subscription/PlanSection";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/Sheet";
import { GENDER_LABEL, STYLE_LABEL } from "@/constants/profile";
import { useAuth } from "@/hooks/useAuth";
import { draftFromProfile, useProfileDetails } from "@/hooks/useProfile";
import { friendlyError } from "@/utils/errors";
import { hasErrors, validateProfile } from "@/utils/profile";

/** Account details, edit / finish profile (issue #5) and sign out. */
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
  // Skipped onboarding or left fields blank → nudge to finish.
  const incomplete = profile
    ? hasErrors(validateProfile(draftFromProfile(profile)))
    : false;

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
              profile
                ? (GENDER_LABEL[profile.gender as keyof typeof GENDER_LABEL] ??
                  profile.gender)
                : null
            }
            loading={isPending}
          />
          <DetailRow
            label="Location"
            value={
              profile?.location_lat != null && profile.location_lon != null
                ? (profile.location_name ??
                  `${Number(profile.location_lat).toFixed(2)}, ${Number(profile.location_lon).toFixed(2)}`)
                : profile
                  ? "Not set"
                  : null
            }
            loading={isPending}
          />
          <DetailRow
            label="Style"
            value={
              profile
                ? profile.style_prefs?.length
                  ? profile.style_prefs.map((s) => STYLE_LABEL[s] ?? s).join(", ")
                  : "Not set"
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

        <PlanSection />

        <LookbookSection />

        {profile !== undefined && (
          <Button
            testID="profile-edit"
            label={incomplete ? "Finish your profile" : "Edit profile"}
            icon={Pencil}
            variant={incomplete ? "primary" : "secondary"}
            size="lg"
            className="mt-8"
            onPress={() =>
              router.push({
                pathname: "/onboarding/profile-form",
                params: { mode: "edit" },
              })
            }
            accessibilityHint="Opens the profile form"
          />
        )}

        <Button
          testID="profile-sign-out"
          label="Sign out"
          icon={LogOut}
          variant="danger"
          size="lg"
          className="mt-4"
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
      className={`flex-row items-center justify-between gap-4 px-4 py-3.5 ${last ? "" : "border-b border-border"}`}
    >
      <Text className="shrink-0 text-callout text-text-muted">{label}</Text>
      {value === null && loading ? (
        <View
          className="h-4 w-24 rounded bg-border"
          accessibilityLabel={`Loading ${label}`}
        />
      ) : (
        <Text className="flex-1 text-right text-callout text-text">
          {value ?? "—"}
        </Text>
      )}
    </View>
  );
}
