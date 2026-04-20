import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ArrowRight,
  Coffee,
  LogIn,
  Mail,
  User as UserIcon,
  UserPlus,
} from "lucide-react-native";

import { ApiError, requestOtp, verifyOtp } from "./api";
import { COLOR, type Session } from "./theme";

type Mode = "select" | "signup" | "login" | "pin";

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: Session) => void;
}) {
  const [mode, setMode] = useState<Mode>("select");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const namesValid = firstName.trim().length > 0 && lastName.trim().length > 0;
  const pinValid = /^\d{4}$/.test(pin);

  const sendCode = async (kind: "signup" | "login") => {
    setError(null);
    setSubmitting(true);
    try {
      await requestOtp({
        email: trimmedEmail,
        firstName: kind === "signup" ? firstName.trim() : undefined,
        lastName: kind === "signup" ? lastName.trim() : undefined,
      });
      setPin("");
      setMode("pin");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const session = await verifyOtp({ email: trimmedEmail, code: pin });
      onAuthenticated(session);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Something went wrong.");
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setError(null);
    if (mode === "pin") {
      // Keep which form we came from — reset into select so the user can
      // re-choose Sign Up vs Log In if they realise they picked the wrong one.
      setPin("");
      setMode("select");
      return;
    }
    setMode("select");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLOR.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 px-6 pt-6 pb-10">
            {mode === "select" ? (
              <View style={{ height: 40 }} />
            ) : (
              <Pressable
                onPress={goBack}
                hitSlop={12}
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{
                  backgroundColor: COLOR.surface,
                  borderWidth: 1,
                  borderColor: COLOR.border,
                }}
              >
                <ArrowLeft size={18} color={COLOR.textMuted} strokeWidth={2} />
              </Pressable>
            )}

            <View className="mt-8">
              <View
                className="h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: COLOR.surface,
                  borderWidth: 1,
                  borderColor: COLOR.border,
                }}
              >
                <Coffee size={22} color={COLOR.accent} strokeWidth={2} />
              </View>
              <Text
                className="mt-5 text-[11px] font-semibold uppercase"
                style={{ color: COLOR.textDim, letterSpacing: 2 }}
              >
                Local Coffee Perks · For the regulars
              </Text>
              <Header mode={mode} email={trimmedEmail} />
            </View>

            {mode === "select" && (
              <SelectStep
                onPick={(next) => {
                  setError(null);
                  setMode(next);
                }}
              />
            )}

            {mode === "signup" && (
              <SignupStep
                firstName={firstName}
                lastName={lastName}
                email={email}
                onFirstName={setFirstName}
                onLastName={setLastName}
                onEmail={setEmail}
                canSubmit={namesValid && emailValid && !submitting}
                submitting={submitting}
                onSubmit={() => sendCode("signup")}
                onToggle={() => {
                  setError(null);
                  setMode("login");
                }}
                error={error}
              />
            )}

            {mode === "login" && (
              <LoginStep
                email={email}
                onEmail={setEmail}
                canSubmit={emailValid && !submitting}
                submitting={submitting}
                onSubmit={() => sendCode("login")}
                onToggle={() => {
                  setError(null);
                  setMode("signup");
                }}
                error={error}
              />
            )}

            {mode === "pin" && (
              <PinStep
                pin={pin}
                onChange={setPin}
                canSubmit={pinValid && !submitting}
                submitting={submitting}
                onSubmit={verify}
                onResend={() => {
                  // Naive resend: route back through whichever form had names.
                  // If names exist -> signup path, else login path.
                  setError(null);
                  if (namesValid) sendCode("signup");
                  else sendCode("login");
                }}
                error={error}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ mode, email }: { mode: Mode; email: string }) {
  if (mode === "select") {
    return (
      <>
        <Text
          className="mt-2 text-[28px] font-semibold"
          style={{ color: COLOR.text, letterSpacing: -0.7 }}
        >
          Your local coffee, on loop.
        </Text>
        <Text
          className="mt-2 text-sm leading-5"
          style={{ color: COLOR.textMuted }}
        >
          Earn stamps at any indie café in the network. No plastic card needed.
        </Text>
      </>
    );
  }
  if (mode === "signup") {
    return (
      <>
        <Text
          className="mt-2 text-[28px] font-semibold"
          style={{ color: COLOR.text, letterSpacing: -0.7 }}
        >
          Create your pass
        </Text>
        <Text
          className="mt-2 text-sm leading-5"
          style={{ color: COLOR.textMuted }}
        >
          We'll email you a 4-digit code. No password needed.
        </Text>
      </>
    );
  }
  if (mode === "login") {
    return (
      <>
        <Text
          className="mt-2 text-[28px] font-semibold"
          style={{ color: COLOR.text, letterSpacing: -0.7 }}
        >
          Welcome back
        </Text>
        <Text
          className="mt-2 text-sm leading-5"
          style={{ color: COLOR.textMuted }}
        >
          Enter your email and we'll send a fresh 4-digit code.
        </Text>
      </>
    );
  }
  return (
    <>
      <Text
        className="mt-2 text-[28px] font-semibold"
        style={{ color: COLOR.text, letterSpacing: -0.7 }}
      >
        Enter your code
      </Text>
      <Text
        className="mt-2 text-sm leading-5"
        style={{ color: COLOR.textMuted }}
      >
        Sent to{" "}
        <Text style={{ color: COLOR.text, fontWeight: "500" }}>{email}</Text>
      </Text>
    </>
  );
}

function SelectStep({ onPick }: { onPick: (m: "signup" | "login") => void }) {
  return (
    <View className="mt-10">
      <ModeCard
        Icon={UserPlus}
        title="Sign Up"
        subtitle="First time here — let's create your loyalty pass."
        onPress={() => onPick("signup")}
      />
      <View style={{ height: 12 }} />
      <ModeCard
        Icon={LogIn}
        title="Log In"
        subtitle="Already have an account? Just enter your email."
        onPress={() => onPick("login")}
      />
      <Text
        className="mt-6 text-center text-[11px]"
        style={{ color: COLOR.textFaint, letterSpacing: 0.3 }}
      >
        By continuing you agree to our Terms & Privacy Policy
      </Text>
    </View>
  );
}

function ModeCard({
  Icon,
  title,
  subtitle,
  onPress,
}: {
  Icon: typeof UserPlus;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-3xl p-5"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: 1,
        borderColor: COLOR.border,
      }}
    >
      <View
        className="h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: "rgba(228,185,127,0.1)",
          borderWidth: 1,
          borderColor: "rgba(228,185,127,0.2)",
        }}
      >
        <Icon size={22} color={COLOR.accent} strokeWidth={1.9} />
      </View>
      <View className="ml-4 flex-1">
        <Text
          className="text-[17px] font-semibold"
          style={{ color: COLOR.text, letterSpacing: -0.2 }}
        >
          {title}
        </Text>
        <Text
          className="mt-0.5 text-[13px] leading-4"
          style={{ color: COLOR.textMuted }}
        >
          {subtitle}
        </Text>
      </View>
      <ArrowRight size={18} color={COLOR.textDim} strokeWidth={2} />
    </Pressable>
  );
}

function SignupStep({
  firstName,
  lastName,
  email,
  onFirstName,
  onLastName,
  onEmail,
  canSubmit,
  submitting,
  onSubmit,
  onToggle,
  error,
}: {
  firstName: string;
  lastName: string;
  email: string;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onEmail: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onToggle: () => void;
  error: string | null;
}) {
  return (
    <View className="mt-9">
      <LabeledInput
        label="First Name"
        Icon={UserIcon}
        value={firstName}
        onChangeText={onFirstName}
        placeholder="Sarah"
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
      />
      <View style={{ height: 14 }} />
      <LabeledInput
        label="Last Name"
        Icon={UserIcon}
        value={lastName}
        onChangeText={onLastName}
        placeholder="Chen"
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
      />
      <View style={{ height: 14 }} />
      <LabeledInput
        label="Email Address"
        Icon={Mail}
        value={email}
        onChangeText={onEmail}
        placeholder="you@cafe.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={canSubmit ? onSubmit : undefined}
      />

      {error ? <ErrorLine message={error} /> : null}

      <PrimaryButton
        label="Send Code"
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />

      <Pressable className="mt-4 items-center" onPress={onToggle} hitSlop={8}>
        <Text className="text-[13px]" style={{ color: COLOR.textMuted }}>
          Already have an account?{" "}
          <Text style={{ color: COLOR.accent, fontWeight: "600" }}>Log in</Text>
        </Text>
      </Pressable>
    </View>
  );
}

function LoginStep({
  email,
  onEmail,
  canSubmit,
  submitting,
  onSubmit,
  onToggle,
  error,
}: {
  email: string;
  onEmail: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onToggle: () => void;
  error: string | null;
}) {
  return (
    <View className="mt-9">
      <LabeledInput
        label="Email Address"
        Icon={Mail}
        value={email}
        onChangeText={onEmail}
        placeholder="you@cafe.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={canSubmit ? onSubmit : undefined}
      />

      {error ? <ErrorLine message={error} /> : null}

      <PrimaryButton
        label="Send Code"
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />

      <Pressable className="mt-4 items-center" onPress={onToggle} hitSlop={8}>
        <Text className="text-[13px]" style={{ color: COLOR.textMuted }}>
          New here?{" "}
          <Text style={{ color: COLOR.accent, fontWeight: "600" }}>
            Create an account
          </Text>
        </Text>
      </Pressable>
    </View>
  );
}

function PinStep({
  pin,
  onChange,
  canSubmit,
  submitting,
  onSubmit,
  onResend,
  error,
}: {
  pin: string;
  onChange: (v: string) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onResend: () => void;
  error: string | null;
}) {
  return (
    <View className="mt-9">
      <Text
        className="mb-3 text-[11px] font-semibold uppercase"
        style={{ color: COLOR.textDim, letterSpacing: 1.5 }}
      >
        4-Digit Code
      </Text>

      <View style={{ position: "relative" }}>
        <TextInput
          value={pin}
          onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          textContentType="oneTimeCode"
          caretHidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 72,
            opacity: 0.01,
            zIndex: 2,
            color: "transparent",
            fontSize: 1,
          }}
        />
        <View className="flex-row items-center justify-between">
          {[0, 1, 2, 3].map((i) => {
            const digit = pin[i] ?? "";
            const isActive = pin.length === i;
            const isFilled = !!digit;
            return (
              <View
                key={i}
                className="items-center justify-center rounded-2xl"
                style={{
                  height: 72,
                  width: 64,
                  backgroundColor: COLOR.surface,
                  borderWidth: isActive ? 1.5 : 1,
                  borderColor: isActive
                    ? COLOR.accent
                    : isFilled
                      ? COLOR.borderStrong
                      : COLOR.border,
                }}
              >
                <Text
                  className="text-3xl font-semibold"
                  style={{
                    color: COLOR.text,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {digit || (isActive ? "·" : "")}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {error ? <ErrorLine message={error} /> : null}

      <PrimaryButton
        label="Verify"
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
      />

      <Pressable className="mt-5 items-center" onPress={onResend} hitSlop={8}>
        <Text className="text-[13px]" style={{ color: COLOR.textMuted }}>
          Didn't receive it?{" "}
          <Text style={{ color: COLOR.accent, fontWeight: "600" }}>
            Resend code
          </Text>
        </Text>
      </Pressable>
    </View>
  );
}

function LabeledInput({
  label,
  Icon,
  ...inputProps
}: {
  label: string;
  Icon: typeof Mail;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text
        className="mb-2 text-[11px] font-semibold uppercase"
        style={{ color: COLOR.textDim, letterSpacing: 1.5 }}
      >
        {label}
      </Text>
      <View
        className="flex-row items-center rounded-2xl px-4"
        style={{
          backgroundColor: COLOR.surface,
          borderWidth: 1,
          borderColor: COLOR.border,
          height: 56,
        }}
      >
        <Icon size={18} color={COLOR.textDim} strokeWidth={1.8} />
        <TextInput
          {...inputProps}
          placeholderTextColor={COLOR.textFaint}
          autoCorrect={false}
          className="flex-1 pl-3 text-base"
          style={{ color: COLOR.text }}
        />
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="mt-6 h-14 items-center justify-center rounded-2xl"
      style={{
        backgroundColor: disabled ? COLOR.surface : COLOR.accent,
        opacity: disabled ? 0.7 : 1,
        borderWidth: 1,
        borderColor: disabled ? COLOR.border : COLOR.accent,
      }}
    >
      <Text
        className="text-base font-semibold"
        style={{
          color: disabled ? COLOR.textMuted : COLOR.accentInk,
          letterSpacing: 0.3,
        }}
      >
        {loading ? "Please wait…" : label}
      </Text>
    </Pressable>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <View
      className="mt-4 rounded-2xl px-4 py-3"
      style={{
        backgroundColor: "rgba(239,68,68,0.08)",
        borderWidth: 1,
        borderColor: "rgba(239,68,68,0.25)",
      }}
    >
      <Text className="text-[13px] leading-5" style={{ color: "#FCA5A5" }}>
        {message}
      </Text>
    </View>
  );
}
