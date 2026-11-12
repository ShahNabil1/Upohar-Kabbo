import { useEffect } from "react";

import { toEnglishDigits } from "./phone";

const NON_ENGLISH_DIGIT = /[০-৯٠-٩]/;

type Editable = HTMLInputElement | HTMLTextAreaElement;

function isEditable(el: EventTarget | null): el is Editable {
  return (
    el instanceof HTMLInputElement ||
    (typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement)
  );
}

/** React keeps its own value tracker, so we must bypass it to fire a real change. */
function setValue(el: Editable, next: string) {
  const proto =
    el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
}

/**
 * Globally converts Bangla (০-৯) and Arabic-Indic (٠-٩) digits typed or pasted
 * into ANY input/textarea into English digits, before React sees the value.
 * Mounted once from the root route.
 */
export function useDigitNormalizer() {
  useEffect(() => {
    const onBeforeInput = (event: Event) => {
      const e = event as InputEvent;
      const el = e.target;
      if (!isEditable(el) || el.readOnly || el.disabled) return;
      const data = e.data ?? e.dataTransfer?.getData("text") ?? "";
      if (!data || !NON_ENGLISH_DIGIT.test(data)) return;

      e.preventDefault();
      const converted = toEnglishDigits(data);

      // `number` inputs expose no selection range — replace the whole value.
      if (el instanceof HTMLInputElement && el.type === "number") {
        setValue(el, `${el.value}${converted}`);
      } else {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        setValue(el, el.value.slice(0, start) + converted + el.value.slice(end));
        const caret = start + converted.length;
        el.setSelectionRange(caret, caret);
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => document.removeEventListener("beforeinput", onBeforeInput, true);
  }, []);
}
