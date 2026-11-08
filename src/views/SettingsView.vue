<script setup>
import CategoryRow from "../components/CategoryRow.vue";
import SettingRow from "../components/SettingRow.vue";
import SelectField from "../components/SelectField.vue";
import ToggleSwitch from "../components/ToggleSwitch.vue";
import { CATEGORIES, HALF_HOUR_TIME_OPTIONS, IDLE_OPTIONS } from "../constants/categories.js";
import { useSettingModel, useSettingsStore } from "../stores/settings.js";
import { ref } from "vue";

const store = useSettingsStore();
const showCustomEditor = ref(false);
const editingId = ref(null);
const customDraft = ref(newCustomReminder());

function newCustomReminder() {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    enabled: true,
    scheduleType: "interval",
    intervalMinutes: 30,
    time: "09:00",
  };
}

function startCreate() {
  editingId.value = null;
  customDraft.value = newCustomReminder();
  showCustomEditor.value = true;
}

function startEdit(reminder) {
  editingId.value = reminder.id;
  customDraft.value = { ...reminder };
  showCustomEditor.value = true;
}

async function saveCustomReminder() {
  const draft = { ...customDraft.value, title: customDraft.value.title.trim() };
  if (!draft.title) return;
  await store.update((settings) => {
    const list = settings.customReminders ?? [];
    const index = list.findIndex((item) => item.id === draft.id);
    if (index >= 0) list[index] = draft;
    else list.push(draft);
    settings.customReminders = list;
  });
  showCustomEditor.value = false;
}

async function toggleCustomReminder(reminder) {
  await store.update((settings) => {
    const target = settings.customReminders.find((item) => item.id === reminder.id);
    if (target) target.enabled = !target.enabled;
  });
}

async function deleteCustomReminder(id) {
  await store.update((settings) => {
    settings.customReminders = (settings.customReminders ?? []).filter((item) => item.id !== id);
  });
}

const isQuietHoursEnabled = useSettingModel("quietHours.enabled");
const quietHoursStart = useSettingModel("quietHours.start");
const quietHoursEnd = useSettingModel("quietHours.end");
const isIdlePauseEnabled = useSettingModel("idlePause.enabled");
const idleMinutes = useSettingModel("idlePause.minutes");
const isLaunchOnLoginEnabled = useSettingModel("launchOnLogin");
const isSoundEnabled = useSettingModel("soundEnabled");
</script>

<template>
  <div class="settings">
    <section>
      <h2 class="settings-section__label">
        Reminders
      </h2>
      <div class="settings-card">
        <CategoryRow
          v-for="category in CATEGORIES"
          :key="category.key"
          :category="category"
        />
      </div>
    </section>

    <section>
      <div class="custom-heading">
        <h2 class="settings-section__label">Custom reminders</h2>
        <button type="button" class="custom-add" @click="startCreate">+ Add reminder</button>
      </div>
      <div class="settings-card custom-reminders">
        <div v-if="!(store.settings.customReminders?.length)" class="custom-empty">
          Create reminders for anything you want to remember.
        </div>
        <div v-for="reminder in (store.settings.customReminders ?? [])" :key="reminder.id" class="custom-item">
          <div class="custom-item__main">
            <strong>{{ reminder.title }}</strong>
            <span>{{ reminder.description || "No description" }}</span>
            <small>{{ reminder.scheduleType === "daily" ? `Daily at ${reminder.time}` : `Every ${reminder.intervalMinutes} minutes` }}</small>
          </div>
          <div class="custom-item__actions">
            <button type="button" @click="toggleCustomReminder(reminder)">{{ reminder.enabled ? "On" : "Off" }}</button>
            <button type="button" @click="startEdit(reminder)">Edit</button>
            <button type="button" class="danger" @click="deleteCustomReminder(reminder.id)">Delete</button>
          </div>
        </div>
      </div>

      <div v-if="showCustomEditor" class="custom-editor">
        <h3>{{ editingId ? "Edit reminder" : "New reminder" }}</h3>
        <label>Title<input v-model="customDraft.title" maxlength="120" placeholder="e.g. Check messages" /></label>
        <label>Description<textarea v-model="customDraft.description" maxlength="1000" placeholder="What should the reminder say?" /></label>
        <label>Schedule
          <select v-model="customDraft.scheduleType">
            <option value="interval">Repeat every interval</option>
            <option value="daily">At a specific time daily</option>
          </select>
        </label>
        <label v-if="customDraft.scheduleType === 'interval'">Interval (minutes)
          <input v-model.number="customDraft.intervalMinutes" type="number" min="1" max="1440" />
        </label>
        <label v-else>Time
          <input v-model="customDraft.time" type="time" />
        </label>
        <div class="custom-editor__buttons">
          <button type="button" @click="showCustomEditor = false">Cancel</button>
          <button type="button" class="custom-save" :disabled="!customDraft.title.trim()" @click="saveCustomReminder">Save reminder</button>
        </div>
      </div>
    </section>

    <section>
      <h2 class="settings-section__label">
        General
      </h2>
      <div class="settings-card">
        <SettingRow
          title="Quiet hours"
          description="Pause reminders automatically during these hours."
          :is-dimmed="!isQuietHoursEnabled"
        >
          <template #control>
            <ToggleSwitch
              v-model="isQuietHoursEnabled"
              label="Quiet hours"
            />
          </template>
          <div
            class="quiet-hours-range"
            :class="{ 'is-dimmed': !isQuietHoursEnabled }"
          >
            <span class="range-label">From</span>
            <SelectField
              v-model="quietHoursStart"
              :options="HALF_HOUR_TIME_OPTIONS"
              label="Quiet hours start"
              :disabled="!isQuietHoursEnabled"
              is-compact
            />
            <span class="range-label">to</span>
            <SelectField
              v-model="quietHoursEnd"
              :options="HALF_HOUR_TIME_OPTIONS"
              label="Quiet hours end"
              :disabled="!isQuietHoursEnabled"
              is-compact
            />
          </div>
        </SettingRow>

        <SettingRow
          title="Auto-pause when idle"
          description="Pauses reminders when you step away, after"
          :is-dimmed="!isIdlePauseEnabled"
        >
          <template #control>
            <ToggleSwitch
              v-model="isIdlePauseEnabled"
              label="Auto-pause when idle"
            />
          </template>
          <template #detail>
            <SelectField
              v-model="idleMinutes"
              :options="IDLE_OPTIONS"
              label="Idle time before pausing"
              :disabled="!isIdlePauseEnabled"
            />
          </template>
        </SettingRow>

        <SettingRow
          title="Launch on login"
          description="Start automatically when you sign in."
        >
          <template #control>
            <ToggleSwitch
              v-model="isLaunchOnLoginEnabled"
              label="Launch on login"
            />
          </template>
        </SettingRow>

        <SettingRow
          title="Notification sound"
          description="Play a sound when a reminder appears."
        >
          <template #control>
            <ToggleSwitch
              v-model="isSoundEnabled"
              label="Notification sound"
            />
          </template>
        </SettingRow>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.settings {
  display: flex;
  // Never shrink: the list is taller than the window, so it must scroll, not squash.
  flex: 1 0 auto;
  flex-direction: column;
  gap: 22px;
  padding: 18px 15px;
}

h2 {
  margin: 0;
}

.quiet-hours-range {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  transition: opacity 150ms ease;
}

.range-label {
  font-size: 11.5px;
  color: var(--text3);
}

.custom-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.custom-add, .custom-item__actions button, .custom-editor button {
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  padding: 6px 9px;
  background: var(--card);
  color: var(--text2);
  font-size: 11.5px;
  cursor: pointer;
}
.custom-reminders { padding: 0 14px; }
.custom-empty { padding: 15px 0; font-size: 12px; color: var(--text3); }
.custom-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 0; border-bottom: 1px solid var(--border);
}
.custom-item:last-child { border-bottom: 0; }
.custom-item__main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.custom-item__main strong { font-size: 12.5px; color: var(--text); }
.custom-item__main span { font-size: 11.5px; color: var(--text2); }
.custom-item__main small { font-size: 10.5px; color: var(--text3); }
.custom-item__actions { display: flex; gap: 5px; flex-shrink: 0; }
.custom-item__actions .danger { color: #c44; }
.custom-editor {
  margin-top: 10px; padding: 14px; border: 1px solid var(--border);
  border-radius: 10px; background: var(--card); display: flex; flex-direction: column; gap: 10px;
}
.custom-editor h3 { margin: 0; font-size: 13px; }
.custom-editor label { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--text2); }
.custom-editor input, .custom-editor textarea, .custom-editor select {
  width: 100%; box-sizing: border-box; border: 1px solid var(--border-strong);
  border-radius: 7px; padding: 8px; background: var(--bg); color: var(--text); font: inherit;
}
.custom-editor textarea { min-height: 65px; resize: vertical; }
.custom-editor__buttons { display: flex; justify-content: flex-end; gap: 7px; }
.custom-editor .custom-save { background: var(--accent); color: white; border-color: transparent; }
.custom-editor button:disabled { opacity: .45; cursor: default; }
</style>
