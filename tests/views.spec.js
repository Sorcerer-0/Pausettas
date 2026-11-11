import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AboutView from "../src/views/AboutView.vue";
import OnboardingView from "../src/views/OnboardingView.vue";
import SettingsView from "../src/views/SettingsView.vue";
import ClockView from "../src/views/ClockView.vue";
import CategoryRow from "../src/components/CategoryRow.vue";
import ToggleSwitch from "../src/components/ToggleSwitch.vue";
import { CATEGORIES } from "../src/constants/categories.js";
import { ONBOARDING_SLIDES } from "../src/constants/onboarding.js";
import { useSettingsStore } from "../src/stores/settings.js";
import { getVersion, invoke, openUrl } from "./setup.js";
import { makeSettings, useFreshApp } from "./helpers.js";

useFreshApp();

describe("AboutView", () => {
  it("shows the version Tauri reports", async () => {
    const about = mount(AboutView);
    await flushPromises();

    expect(about.find(".about__fact-value").text()).toBe("1.2.3");
  });

  it("links to the license and source", () => {
    const about = mount(AboutView);

    expect(about.text()).toContain("GPL-3.0");
    expect(about.find(".about__fact-link").attributes("href")).toBe(
      "https://github.com/MasihTak/Pausetta",
    );
  });

  it("opens the repo through Rust instead of navigating the webview", async () => {
    const about = mount(AboutView);
    await about.find(".about__fact-link").trigger("click");

    expect(openUrl).toHaveBeenCalledWith("https://github.com/MasihTak/Pausetta");
  });

  // `pnpm dev` runs the frontend with no Tauri backend behind it.
  it("hides the version block outside Tauri instead of failing", async () => {
    getVersion.mockRejectedValue(new Error("not in tauri"));
    const about = mount(AboutView);
    await flushPromises();

    expect(about.find(".about__fact-value").text()).toBe("GPL-3.0");
    expect(about.text()).toContain("Pausetta");
  });
});

describe("SettingsView", () => {
  const mountSettings = async (overrides) => {
    invoke.mockResolvedValueOnce(makeSettings(overrides));
    const store = useSettingsStore();
    await store.load();
    return mount(SettingsView);
  };

  it("gives each category its own independently toggleable row", async () => {
    const settings = await mountSettings();

    const rows = settings.findAllComponents(CategoryRow);
    expect(rows.map((row) => row.props("category").key)).toEqual(
      CATEGORIES.map((category) => category.key),
    );
  });

  it("reflects the stored general settings", async () => {
    const settings = await mountSettings();

    const selects = settings.findAll("select");
    expect(selects.map((select) => select.element.value).slice(-3)).toEqual([
      "22:00",
      "08:00",
      "5",
    ]);
  });

  it("dims and disables quiet hours while they're off", async () => {
    const settings = await mountSettings({
      quietHours: { enabled: false, start: "22:00", end: "08:00" },
    });

    expect(settings.find(".quiet-hours-range").classes()).toContain("is-dimmed");
    const timeSelects = settings.findAll(".quiet-hours-range select");
    expect(timeSelects.every((select) => select.attributes("disabled") !== undefined)).toBe(true);
  });

  it("disables the idle delay while auto-pause is off", async () => {
    const settings = await mountSettings({ idlePause: { enabled: false, minutes: 5 } });

    const idleSelect = settings.findAll("select").at(-1);
    expect(idleSelect.attributes("disabled")).toBeDefined();
  });

  // Each fixture setting is flipped from its makeSettings() value by one click.
  it.each([
    ["Quiet hours", { quietHours: { enabled: false, start: "22:00", end: "08:00" } }],
    ["Auto-pause when idle", { idlePause: { enabled: false, minutes: 5 } }],
    ["Launch on login", { launchOnLogin: true }],
    ["Notification sound", { soundEnabled: true }],
  ])("persists the '%s' toggle", async (label, expectedChange) => {
    const settings = await mountSettings();
    const toggle = settings
      .findAllComponents(ToggleSwitch)
      .find((candidate) => candidate.props("label") === label);

    invoke.mockResolvedValueOnce(makeSettings());
    await toggle.trigger("click");

    expect(invoke).toHaveBeenLastCalledWith("update_settings", {
      settings: expect.objectContaining(expectedChange),
    });
  });

  it("persists a quiet hours time change", async () => {
    const settings = await mountSettings();

    invoke.mockResolvedValueOnce(makeSettings());
    await settings.findAll(".quiet-hours-range select")[0].setValue("23:30");

    expect(invoke).toHaveBeenLastCalledWith("update_settings", {
      settings: expect.objectContaining({
        quietHours: { enabled: true, start: "23:30", end: "08:00" },
      }),
    });

    invoke.mockResolvedValueOnce(makeSettings());
    await settings.findAll(".quiet-hours-range select")[1].setValue("07:00");

    expect(invoke).toHaveBeenLastCalledWith("update_settings", {
      settings: expect.objectContaining({
        quietHours: expect.objectContaining({ end: "07:00" }),
      }),
    });
  });

  it("persists an idle delay change", async () => {
    const settings = await mountSettings();

    invoke.mockResolvedValueOnce(makeSettings());
    await settings.findAll("select").at(-1).setValue("15");

    expect(invoke).toHaveBeenLastCalledWith("update_settings", {
      settings: expect.objectContaining({ idlePause: { enabled: true, minutes: 15 } }),
    });
  });
});

describe("ClockView", () => {
  const STORAGE_KEY = "pausetta.clock-tools.v1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts and persists a countdown using an absolute deadline", async () => {
    vi.useFakeTimers();
    const clock = mount(ClockView, { props: { active: true } });
    await flushPromises();

    expect(clock.find(".clock-readout").text()).toBe("00:05:00");
    await clock.find(".clock-actions .primary").trigger("click");

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(saved.timerEndAt).toBeGreaterThan(Date.now());

    await vi.advanceTimersByTimeAsync(1000);
    expect(clock.find(".clock-readout").text()).toBe("00:04:59");

    clock.unmount();
    vi.useRealTimers();
  });

  it("pauses and resumes a countdown without resetting its remaining time", async () => {
    vi.useFakeTimers();
    const clock = mount(ClockView, { props: { active: true } });
    await flushPromises();

    await clock.find(".clock-actions .primary").trigger("click");
    await vi.advanceTimersByTimeAsync(2000);
    await clock.find(".clock-actions .primary").trigger("click");

    const paused = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(paused.timerIsPaused).toBe(true);
    expect(paused.timerRemainingMs).toBeLessThanOrEqual(298000);
    expect(paused.timerRemainingMs).toBeGreaterThan(297000);

    await clock.find(".clock-actions .primary").trigger("click");
    const resumed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(resumed.timerEndAt - Date.now()).toBe(paused.timerRemainingMs);

    clock.unmount();
    vi.useRealTimers();
  });

  it("runs the stopwatch and records lap times", async () => {
    vi.useFakeTimers();
    const clock = mount(ClockView, { props: { active: true } });
    await flushPromises();

    await clock.findAll(".clock-tabs button")[1].trigger("click");
    await clock.find(".clock-actions .primary").trigger("click");
    await vi.advanceTimersByTimeAsync(1250);
    await clock.find(".clock-actions .secondary").trigger("click");

    expect(clock.findAll(".lap-row")).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).stopwatchLaps).toHaveLength(1);

    clock.unmount();
    vi.useRealTimers();
  });

  it("adds, disables, and deletes a daily alarm", async () => {
    const clock = mount(ClockView, { props: { active: true } });
    await flushPromises();

    await clock.findAll(".clock-tabs button")[2].trigger("click");
    await clock.find(".alarm-label input").setValue("Wake up");
    await clock.find('input[type="time"]').setValue("07:45");
    await clock.find(".add-alarm").trigger("click");

    let saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(saved.alarms[0]).toMatchObject({
      label: "Wake up",
      time: "07:45",
      repeat: "daily",
      enabled: true,
    });

    await clock.find(".alarm-toggle").trigger("click");
    saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(saved.alarms[0].enabled).toBe(false);

    await clock.find(".delete-alarm").trigger("click");
    saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(saved.alarms).toHaveLength(0);

    clock.unmount();
  });

  it("fires a one-time alarm in a persistent native reminder window", async () => {
    vi.useFakeTimers();
    const now = new Date();
    now.setSeconds(0, 0);
    vi.setSystemTime(now);
    const pad = (value) => String(value).padStart(2, "0");
    const time = pad(now.getHours()) + ":" + pad(now.getMinutes());
    const date = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      alarms: [{
        id: "wake",
        label: "Wake up",
        time,
        date,
        repeat: "once",
        enabled: true,
        lastFiredKey: "",
      }],
    }));
    invoke.mockResolvedValue(undefined);

    const clock = mount(ClockView, { props: { active: false } });
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("show_clock_alert", {
      title: "Wake up",
      description: "Alarm · " + time,
    });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).alarms[0].enabled).toBe(false);

    clock.unmount();
    vi.useRealTimers();
  });
});

describe("OnboardingView", () => {
  const lastIndex = ONBOARDING_SLIDES.length - 1;

  it("starts on the welcome slide with no Back button", () => {
    const onboarding = mount(OnboardingView);

    expect(onboarding.find(".onboarding__step").text()).toBe(`1 of ${ONBOARDING_SLIDES.length}`);
    expect(onboarding.find(".onboarding__back").exists()).toBe(false);
    expect(onboarding.find(".onboarding__next").text()).toBe("Next");
  });

  it("renders every slide's copy up front, for the sliding track", () => {
    const onboarding = mount(OnboardingView);

    expect(onboarding.findAll(".slide")).toHaveLength(ONBOARDING_SLIDES.length);
    expect(onboarding.findAll(".slide__note")).toHaveLength(ONBOARDING_SLIDES.length - 1);
  });

  it("hides the off-screen slides from assistive tech", () => {
    const onboarding = mount(OnboardingView);

    const hidden = onboarding.findAll(".slide").map((slide) => slide.attributes("aria-hidden"));
    expect(hidden).toEqual(["false", "true", "true", "true", "true"]);
  });

  it("advances and steps back", async () => {
    const onboarding = mount(OnboardingView);

    await onboarding.find(".onboarding__next").trigger("click");
    expect(onboarding.find(".onboarding__step").text()).toBe(`2 of ${ONBOARDING_SLIDES.length}`);
    expect(onboarding.find(".onboarding__track").attributes("style")).toContain("-100%");

    await onboarding.find(".onboarding__back").trigger("click");
    expect(onboarding.find(".onboarding__step").text()).toBe(`1 of ${ONBOARDING_SLIDES.length}`);
  });

  it("jumps to a slide from its dot", async () => {
    const onboarding = mount(OnboardingView);

    await onboarding.findAll(".dots__dot")[3].trigger("click");

    expect(onboarding.find(".onboarding__step").text()).toBe(`4 of ${ONBOARDING_SLIDES.length}`);
    expect(onboarding.findAll(".dots__dot")[3].attributes("aria-current")).toBe("true");
  });

  it("finishes from the last slide instead of advancing", async () => {
    const onboarding = mount(OnboardingView);
    await onboarding.findAll(".dots__dot")[lastIndex].trigger("click");

    expect(onboarding.find(".onboarding__skip").exists()).toBe(false);
    expect(onboarding.find(".onboarding__next").text()).toBe("Get started");

    await onboarding.find(".onboarding__next").trigger("click");
    expect(onboarding.emitted("finish")).toHaveLength(1);
  });

  it("finishes on Skip", async () => {
    const onboarding = mount(OnboardingView);

    await onboarding.find(".onboarding__skip").trigger("click");

    expect(onboarding.emitted("finish")).toHaveLength(1);
  });

  it("tints each slide with its category, and the welcome with the app accent", () => {
    const onboarding = mount(OnboardingView);

    const slides = onboarding.findAll(".slide");
    expect(slides[0].attributes("style")).toContain("var(--accent)");
    expect(slides[1].attributes("style")).toContain("var(--cat-eye)");
  });
});
