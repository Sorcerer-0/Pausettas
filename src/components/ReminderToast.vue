<script setup>
import { computed, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import AppMark from "./AppMark.vue";
import CategoryIcon from "./CategoryIcon.vue";
import UiIcon from "./UiIcon.vue";
import { CATEGORY_BY_KEY, SNOOZE_MINUTES } from "../constants/categories.js";
import { useSettingsStore } from "../stores/settings.js";

const store = useSettingsStore();
// A toast shows one reminder for its whole life: Rust opens a new window for the next one.
const categoryKey = window.__PAUSETTA_REMINDER_CATEGORY__;

const card = ref(null);

const customReminder = window.__PAUSETTA_CUSTOM_REMINDER__ ?? null;
const category = CATEGORY_BY_KEY[categoryKey] ?? null;
const isCustom = Boolean(customReminder);
const reminderTitle = isCustom ? customReminder.title : category.label;
const reminderBody = isCustom ? customReminder.description : category.toast.body;
const categoryColor = isCustom ? "var(--accent)" : `var(--cat-${categoryKey})`;
const intervalMinutes = computed(
  () => store.settings?.categories?.[categoryKey]?.intervalMinutes,
);

// The window is larger than the card to fit its glow. Rust makes that invisible margin
// click-through, so it needs to know where the card is.
function reportCardBounds() {
  const { left, top, right, bottom } = card.value.getBoundingClientRect();
  invoke("set_toast_card_bounds", { bounds: { left, top, right, bottom } }).catch((error) =>
    console.error("[pausetta] could not report the toast's bounds", error),
  );
}

onMounted(() => {
  store.load().catch((error) => console.error("[pausetta] could not load settings", error));
  // Again once the entrance animation ends: it moves the card, and Rust keeps the last report.
  reportCardBounds();
});

function dismiss() {
  invoke("close_reminder").catch((error) => console.error("[pausetta] could not close reminder", error));
}

// Rust owns the schedule, so snoozing is a request to move this category's next trigger.
function snooze() {
  invoke("snooze_reminder", { category: categoryKey }).catch((error) =>
    console.error("[pausetta] could not snooze reminder", error),
  );
}
</script>

<template>
  <div
    class="toast-stage is-centered"
    class="toast-stage"
  >
    <article
      ref="card"
      class="toast"
      :style="{ '--cat': categoryColor }"
      @animationend.self="reportCardBounds"
    >
      <div class="toast__glow" />

      <div class="toast__content">
        <header class="toast__header">
          <span class="toast__mark">
            <AppMark :size="18" />
          </span>
          <span class="toast__app-name">Pausetta</span>
          <span v-if="isCustom" class="toast__chip">Custom reminder</span>
          <span v-else-if="intervalMinutes" class="toast__chip">Every {{ intervalMinutes }} min</span>
          <span class="toast__spacer" />
          <button
            type="button"
            class="toast__close"
            aria-label="Close reminder"
            @click="dismiss"
          >
            <UiIcon
              name="close"
              :size="18"
              :stroke-width="2.2"
            />
          </button>
        </header>

        <div class="toast__main">
          <div class="toast__tile">
            <div class="toast__tile-halo" />
            <CategoryIcon
              v-if="!isCustom"
              :category="categoryKey"
              :size="42"
              class="toast__tile-icon"
            />
            <AppMark v-else :size="42" />
          </div>

          <div class="toast__text">
            <h1 class="toast__title">
              {{ reminderTitle }}
            </h1>
            <p class="toast__body">
              {{ reminderBody }}
            </p>

            <div v-if="!isCustom" class="toast__cue">
              <component :is="category.toast.cueVisual" />
              <span class="toast__cue-text">{{ category.toast.cue }}</span>
            </div>

            <div class="toast__actions">
              <button
                type="button"
                class="toast__primary"
                @click="dismiss"
              >
                {{ isCustom ? "Dismiss" : category.toast.action }}
              </button>
              <button
                v-if="!isCustom"
                type="button"
                class="toast__ghost"
                @click="snooze"
              >
                Snooze {{ SNOOZE_MINUTES }} min
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped lang="scss">
.toast-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  padding: 20px;
}

.toast {
  --cat-ink: color-mix(in srgb, var(--cat) 86%, #1a0f0c);

  position: relative;
  width: min(700px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--cat) 26%, var(--win-border));
  border-radius: 22px;
  background: var(--card);
  box-shadow: var(--shadow), 0 28px 70px -18px color-mix(in srgb, var(--cat) 42%, transparent);
  animation: toast-in 260ms cubic-bezier(0.2, 0.9, 0.25, 1);
}

.toast__glow {
  position: absolute;
  top: -100px;
  right: -80px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, color-mix(in srgb, var(--cat) 30%, transparent), transparent 70%);
}

.toast__content {
  position: relative;
  padding: 30px 34px 28px;
}

.toast__header {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 24px;
}

.toast__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 20%, var(--card));
  color: var(--accent);
}

.toast__app-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text3);
}

.toast__chip {
  padding: 5px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cat) 15%, var(--card));
  color: var(--cat-ink);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.toast__spacer {
  flex: 1;
}

.toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text3);
  cursor: pointer;

  &:hover {
    background: var(--border);
    color: var(--text);
  }
}

.toast__main {
  display: flex;
  align-items: flex-start;
  gap: 22px;
}

.toast__tile {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 76px;
  height: 76px;
  overflow: hidden;
  border-radius: 22px;
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--cat) 86%, #ffffff),
    color-mix(in srgb, var(--cat) 92%, #2a1410)
  );
  box-shadow:
    0 10px 28px -8px color-mix(in srgb, var(--cat) 55%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  color: #ffffff;
}

.toast__tile-halo {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.34), transparent 62%);
}

.toast__tile-icon {
  position: relative;
}

.toast__text {
  flex: 1;
  min-width: 0;
}

.toast__title {
  margin: 0;
  font-size: 29px;
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text);
}

.toast__body {
  margin: 9px 0 0;
  font-size: 20px;
  line-height: 1.5;
  color: var(--text2);
  text-wrap: pretty;
}

.toast__cue {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 21px;
  padding: 16px 19px;
  border: 1px solid color-mix(in srgb, var(--cat) 20%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--cat) 9%, var(--card));
}

.toast__cue-text {
  flex: 1;
  min-width: 0;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--text2);
  text-wrap: pretty;
}

.toast__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 23px;
}

.toast__primary,
.toast__ghost {
  padding: 12px 22px;
  border-radius: 11px;
  font-size: 17px;
  cursor: pointer;
}

.toast__primary {
  border: none;
  background: color-mix(in srgb, var(--cat) 94%, #2a1410);
  box-shadow: 0 7px 18px -6px color-mix(in srgb, var(--cat) 60%, transparent);
  color: #ffffff;
  font-weight: 650;
}

.toast__ghost {
  padding-inline: 20px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text2);
  font-weight: 550;
}

@media (max-width: 560px) {
  .toast__content {
    padding: 22px 20px;
  }

  .toast__main {
    gap: 14px;
  }

  .toast__tile {
    width: 56px;
    height: 56px;
    border-radius: 16px;
  }

  .toast__title {
    font-size: 23px;
  }

  .toast__body {
    font-size: 16px;
  }

  .toast__cue-text {
    font-size: 14px;
  }

  .toast__primary,
  .toast__ghost {
    font-size: 14px;
  }
}

@media (prefers-color-scheme: dark) {
  .toast {
    --cat-ink: var(--cat);
  }

  .toast__glow {
    background: radial-gradient(circle, color-mix(in srgb, var(--cat) 26%, transparent), transparent 70%);
  }

  .toast__chip {
    background: color-mix(in srgb, var(--cat) 22%, var(--card));
  }

  .toast__tile {
    background: linear-gradient(
      150deg,
      color-mix(in srgb, var(--cat) 84%, #15110e),
      color-mix(in srgb, var(--cat) 52%, #15110e)
    );
  }

  .toast__cue {
    border-color: color-mix(in srgb, var(--cat) 26%, transparent);
    background: color-mix(in srgb, var(--cat) 14%, var(--card));
  }

  .toast__primary {
    background: var(--cat);
    color: #15110e;
  }
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
  }
}
</style>