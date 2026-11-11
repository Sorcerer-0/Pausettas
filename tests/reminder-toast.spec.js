import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ReminderToast from "../src/components/ReminderToast.vue";
import { CATEGORY_BY_KEY } from "../src/constants/categories.js";
import { invoke } from "./setup.js";
import { useFreshApp } from "./helpers.js";

useFreshApp();

// Rust injects both globals when it creates the reminder window (reminder_window.rs).
beforeEach(() => {
  window.__PAUSETTA_REMINDER_CATEGORY__ = "eye";
  window.__PAUSETTA_REMINDER_ANCHOR__ = "bottom";
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__PAUSETTA_REMINDER_CATEGORY__;
  delete window.__PAUSETTA_REMINDER_ANCHOR__;
});

async function mountToast() {
  const toast = mount(ReminderToast);
  await flushPromises();
  return { toast };
}

describe("ReminderToast", () => {
  it("shows the injected category's copy", async () => {
    const { toast } = await mountToast();

    expect(toast.find(".toast__title").text()).toBe("Eye care");
    expect(toast.find(".toast__body").text()).toBe(CATEGORY_BY_KEY.eye.toast.body);
    expect(toast.find(".toast__cue-text").text()).toBe(CATEGORY_BY_KEY.eye.toast.cue);
    expect(toast.find(".toast__primary").text()).toBe(CATEGORY_BY_KEY.eye.toast.action);
  });

  it("shows the category's interval once settings arrive", async () => {
    const { toast } = await mountToast();

    expect(toast.find(".toast__chip").text()).toBe("Every 20 min");
  });

  it("renders without a chip when settings can't be loaded", async () => {
    invoke.mockRejectedValue(new Error("no database"));
    const { toast } = await mountToast();

    expect(toast.find(".toast__chip").exists()).toBe(false);
    expect(toast.find(".toast__title").text()).toBe("Eye care");
  });

  it.each([
    ["eye", ".cue-ring"],
    ["posture", ".cue-posture"],
    ["movement", ".cue-bars"],
    ["hydration", ".cue-glass"],
  ])("draws the %s cue", async (category, selector) => {
    window.__PAUSETTA_REMINDER_CATEGORY__ = category;
    const { toast } = await mountToast();

    expect(toast.find(selector).exists()).toBe(true);
  });

  it("centers preset reminders regardless of the old platform anchor value", async () => {
    window.__PAUSETTA_REMINDER_ANCHOR__ = "top";
    const { toast } = await mountToast();

    expect(toast.find(".toast-stage").classes()).toContain("is-centered");
    expect(toast.find(".toast-stage").classes()).not.toContain("is-top");
  });

  it("asks Rust to close the window on the primary action", async () => {
    const { toast } = await mountToast();

    await toast.find(".toast__primary").trigger("click");

    expect(invoke).toHaveBeenCalledWith("close_reminder");
  });

  it("asks Rust to close the window on the close button", async () => {
    const { toast } = await mountToast();

    await toast.find(".toast__close").trigger("click");

    expect(invoke).toHaveBeenCalledWith("close_reminder");
  });

  it("asks Rust to move the next trigger on snooze", async () => {
    const { toast } = await mountToast();

    await toast.find(".toast__ghost").trigger("click");

    expect(invoke).toHaveBeenCalledWith("snooze_reminder", { category: "eye" });
  });

  it("logs, rather than throws, when Rust rejects a close or a snooze", async () => {
    const { toast } = await mountToast();
    invoke.mockRejectedValue(new Error("window gone"));

    await toast.find(".toast__primary").trigger("click");
    await toast.find(".toast__ghost").trigger("click");
    await flushPromises();

    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("labels the snooze button with the length Rust uses", async () => {
    const { toast } = await mountToast();

    expect(toast.find(".toast__ghost").text()).toBe("Snooze 10 min");
  });

  it("stays visible when unattended and when the pointer enters or leaves", async () => {
    vi.useFakeTimers();
    const { toast } = await mountToast();

    await toast.find(".toast").trigger("mouseenter");
    vi.advanceTimersByTime(60_000);
    await toast.find(".toast").trigger("mouseleave");
    vi.advanceTimersByTime(60_000);

    expect(toast.find(".toast").exists()).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith("close_reminder");
    toast.unmount();
  });

  it("tells Rust where the card is, again once its entrance animation has moved it", async () => {
    const card = (left) => ({ left, top: 30, right: left + 700, bottom: 510 });
    const { toast } = await mountToast();
    const cardElement = toast.find(".toast").element;
    expect(invoke).toHaveBeenCalledWith("set_toast_card_bounds", {
      bounds: { left: 0, top: 0, right: 0, bottom: 0 },
    });

    cardElement.getBoundingClientRect = () => card(30);
    await toast.find(".toast").trigger("animationend");

    expect(invoke).toHaveBeenLastCalledWith("set_toast_card_bounds", { bounds: card(30) });
    toast.unmount();
  });

  it("ignores animations that end on the card's children", async () => {
    const { toast } = await mountToast();
    invoke.mockClear();

    await toast.find(".toast__body").trigger("animationend");

    expect(invoke).not.toHaveBeenCalledWith("set_toast_card_bounds", expect.anything());
    toast.unmount();
  });

  it("logs, rather than throws, when Rust rejects the card bounds", async () => {
    invoke.mockRejectedValue(new Error("window gone"));
    const { toast } = await mountToast();

    expect(console.error).toHaveBeenCalledWith(
      "[pausetta] could not report the toast's bounds",
      expect.any(Error),
    );
    toast.unmount();
  });


});
