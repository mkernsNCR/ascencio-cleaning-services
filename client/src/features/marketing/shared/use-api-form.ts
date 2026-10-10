import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { marketingMessages } from "./messages";

export type FormStatus = "idle" | "submitting" | "success" | "error";
type FormErrorCode = "network" | "rateLimited" | "generic" | "fixFields";
/** Field error codes, resolved to localized text at render time so locale switches apply. */
export type FieldErrorCodes = Record<string, string>;

/** Maps a server validation message (Zod message or stable code) to a UI error code. */
function codeFromServer(field: string, message: string): string {
  if (message === "invalid_phone" || message === "invalid_postal_code" || message === "invalid_email") return message;
  if (/required|at least 1 character/i.test(message)) return "required";
  if (field === "email" || /email/i.test(message)) return "invalid_email";
  return "invalid_value";
}

/**
 * Shared submit/validation state for marketing forms: client-side required checks, server field
 * errors, network and rate-limit handling, and focus management. Entered values are owned by the
 * form and are never cleared on error.
 */
export function useApiForm(extraMessages: Record<string, string> = {}) {
  const common = useMessages(commonMessages);
  const m = useMessages(marketingMessages);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [formError, setFormError] = useState<FormErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorCodes>({});
  const formRef = useRef<HTMLFormElement>(null);

  const focusFirstInvalid = useCallback(() => {
    // Wait for React to render aria-invalid before moving focus.
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }, []);

  const submit = useCallback(
    async (clientErrors: FieldErrorCodes, send: () => Promise<unknown>) => {
      if (Object.keys(clientErrors).length) {
        setFieldErrors(clientErrors);
        setFormError("fixFields");
        setStatus("error");
        focusFirstInvalid();
        return false;
      }
      setStatus("submitting");
      setFormError(null);
      setFieldErrors({});
      try {
        await send();
        setStatus("success");
        return true;
      } catch (error) {
        setStatus("error");
        if (error instanceof ApiError) {
          if (error.isNetwork) setFormError("network");
          else if (error.code === "rate_limited" || error.status === 429) setFormError("rateLimited");
          else if (error.fields && Object.keys(error.fields).length) {
            const mapped: FieldErrorCodes = {};
            for (const [field, message] of Object.entries(error.fields)) mapped[field] = codeFromServer(field, message);
            setFieldErrors(mapped);
            setFormError("fixFields");
            focusFirstInvalid();
          } else setFormError("generic");
        } else setFormError("generic");
        return false;
      }
    },
    [focusFirstInvalid],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setFormError(null);
    setFieldErrors({});
  }, []);

  const errorText = (code: string): string => {
    const commonErrors = common.errors as Record<string, string>;
    if (code in extraMessages) return extraMessages[code];
    if (code !== "network" && code in commonErrors) return commonErrors[code];
    return m.form.invalidValue;
  };

  const fieldError = (name: string): string | null => (fieldErrors[name] ? errorText(fieldErrors[name]) : null);

  const formErrorText = formError
    ? formError === "network"
      ? common.errors.network
      : formError === "rateLimited"
        ? common.errors.rateLimited
        : formError === "fixFields"
          ? common.errors.fixFields
          : common.errors.generic
    : null;

  return { status, formRef, submit, reset, fieldError, formErrorText, submitting: status === "submitting" };
}

/** Returns trimmed text or undefined, so optional fields are omitted rather than sent empty. */
export const optional = (value: string) => (value.trim() ? value.trim() : undefined);

export function requireFields(values: Record<string, string>, names: string[]): FieldErrorCodes {
  const errors: FieldErrorCodes = {};
  for (const name of names) if (!values[name]?.trim()) errors[name] = "required";
  return errors;
}
