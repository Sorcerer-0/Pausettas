<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const props = defineProps({
  active: { type: Boolean, default: false },
});

const STORAGE_KEY = "pausetta.clock-tools.v1";
const pad = (value) => String(value).padStart(2, "0");
const todayKey = (date = new Date()) =>
  date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());

const activeTab = ref("timer");
const now = ref(Date.now());

// Timer state is based on an absolute deadline, so it does not drift when the UI is idle.
const timerHours = ref(0);
const timerMinutes = ref(5);
const timerSeconds = ref(0);
const timerRemainingMs = ref(300000);
const timerEndAt = ref(null);
const timerCompleted = ref(false);
const timerIsPaused = ref(false);
const timerIsRunning = computed(() => timerEndAt.value !== null);
const timerInputMs = computed(
  () => ((Number(timerHours.value) * 3600) +
    (Number(timerMinutes.value) * 60) +
    Number(timerSeconds.value)) * 1000,
);
const timerDisplayMs = computed(() =>
  timerIsRunning.value
    ? Math.max(0, timerEndAt.value - now.value)
    : timerIsPaused.value
      ? timerRemainingMs.value
      : timerInputMs.value,
);

// Stopwatch stores an accumulated duration plus its current start timestamp.
const stopwatchStartedAt = ref(null);
const stopwatchElapsedBeforeStart = ref(0);
const stopwatchElapsedMs = computed(() =>
  stopwatchElapsedBeforeStart.value +
  (stopwatchStartedAt.value ? Math.max(0, now.value - stopwatchStartedAt.value) : 0),
);
const stopwatchIsRunning = computed(() => stopwatchStartedAt.value !== null);
const stopwatchLaps = ref([]);

const alarms = ref([]);
const alarmLabel = ref("");
const alarmTime = ref("08:00");
const alarmDate = ref(todayKey());
const alarmRepeat = ref("daily");
const notices = ref([]);

let ticker = null;

function formatTimer(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
}

function formatStopwatch(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds) + "." + pad(hundredths);
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      timerHours: timerHours.value,
      timerMinutes: timerMinutes.value,
      timerSeconds: timerSeconds.value,
      timerRemainingMs: timerRemainingMs.value,
      timerEndAt: timerEndAt.value,
      timerCompleted: timerCompleted.value,
      timerIsPaused: timerIsPaused.value,
      stopwatchStartedAt: stopwatchStartedAt.value,
      stopwatchElapsedBeforeStart: stopwatchElapsedBeforeStart.value,
      stopwatchLaps: stopwatchLaps.value,
      alarms: alarms.value,
    }));
  } catch (error) {
    console.error("[pausetta] could not save clock tools", error);
  }
}

function loadState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    timerHours.value = Number(saved.timerHours ?? 0);
    timerMinutes.value = Number(saved.timerMinutes ?? 5);
    timerSeconds.value = Number(saved.timerSeconds ?? 0);
    timerRemainingMs.value = Number(saved.timerRemainingMs ?? 300000);
    timerEndAt.value = saved.timerEndAt ?? null;
    timerCompleted.value = Boolean(saved.timerCompleted);
    timerIsPaused.value = Boolean(saved.timerIsPaused);
    stopwatchStartedAt.value = saved.stopwatchStartedAt ?? null;
    stopwatchElapsedBeforeStart.value = Number(saved.stopwatchElapsedBeforeStart ?? 0);
    stopwatchLaps.value = Array.isArray(saved.stopwatchLaps) ? saved.stopwatchLaps : [];
    alarms.value = Array.isArray(saved.alarms) ? saved.alarms : [];

    if (timerEndAt.value && timerEndAt.value <= Date.now()) {
      timerEndAt.value = null;
      timerRemainingMs.value = 0;
      timerCompleted.value = true;
      timerIsPaused.value = false;
      saveState();
      showNotice("Timer finished", "Your countdown has reached zero.");
    }
  } catch (error) {
    console.error("[pausetta] could not load clock tools", error);
  }
}

async function showNotice(title, message) {
  try {
    await invoke("show_clock_alert", { title, description: message });
  } catch (error) {
    console.error("[pausetta] could not open the clock alert window", error);
    notices.value.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      title,
      message,
    });
  }
}

function dismissNotice(id) {
  notices.value = notices.value.filter((notice) => notice.id !== id);
}

function startTimer() {
  if (timerIsRunning.value) return;

  timerHours.value = Math.min(99, Math.max(0, Math.floor(Number(timerHours.value) || 0)));
  timerMinutes.value = Math.min(59, Math.max(0, Math.floor(Number(timerMinutes.value) || 0)));
  timerSeconds.value = Math.min(59, Math.max(0, Math.floor(Number(timerSeconds.value) || 0)));

  const duration = timerIsPaused.value ? timerRemainingMs.value : timerInputMs.value;
  if (!Number.isFinite(duration) || duration <= 0) return;
  timerRemainingMs.value = duration;
  timerIsPaused.value = false;
  timerCompleted.value = false;
  timerEndAt.value = Date.now() + duration;
  saveState();
}

function pauseTimer() {
  if (!timerEndAt.value) return;
  timerRemainingMs.value = Math.max(0, timerEndAt.value - Date.now());
  timerEndAt.value = null;
  timerIsPaused.value = true;
  saveState();
}

function resetTimer() {
  timerEndAt.value = null;
  timerRemainingMs.value = timerInputMs.value;
  timerIsPaused.value = false;
  timerCompleted.value = false;
  saveState();
}

function startStopwatch() {
  if (stopwatchIsRunning.value) return;
  stopwatchStartedAt.value = Date.now();
  saveState();
}

function pauseStopwatch() {
  if (!stopwatchStartedAt.value) return;
  stopwatchElapsedBeforeStart.value += Date.now() - stopwatchStartedAt.value;
  stopwatchStartedAt.value = null;
  saveState();
}

function addLap() {
  if (!stopwatchIsRunning.value) return;
  const elapsed = stopwatchElapsedMs.value;
  const previous = stopwatchLaps.value[0]?.totalMs ?? 0;
  stopwatchLaps.value.unshift({
    number: stopwatchLaps.value.length + 1,
    totalMs: elapsed,
    splitMs: elapsed - previous,
  });
  saveState();
}

function resetStopwatch() {
  stopwatchStartedAt.value = null;
  stopwatchElapsedBeforeStart.value = 0;
  stopwatchLaps.value = [];
  saveState();
}

function addAlarm() {
  if (!alarmTime.value || (alarmRepeat.value === "once" && alarmDate.value < todayKey())) return;
  alarms.value.push({
    id: Date.now() + "-" + Math.random().toString(36).slice(2),
    label: alarmLabel.value.trim() || "Alarm",
    time: alarmTime.value,
    date: alarmRepeat.value === "once" ? alarmDate.value : "",
    repeat: alarmRepeat.value,
    enabled: true,
    lastFiredKey: "",
  });
  alarms.value.sort((a, b) => a.time.localeCompare(b.time));
  alarmLabel.value = "";
  saveState();
}

function toggleAlarm(alarm) {
  alarm.enabled = !alarm.enabled;
  saveState();
}

function deleteAlarm(id) {
  alarms.value = alarms.value.filter((alarm) => alarm.id !== id);
  saveState();
}

function checkAlarms(currentTime) {
  const date = todayKey(currentTime);
  const clock = pad(currentTime.getHours()) + ":" + pad(currentTime.getMinutes());
  let changed = false;

  for (const alarm of alarms.value) {
    if (!alarm.enabled) continue;
    const isToday = alarm.repeat === "daily" || alarm.date === date;
    if (!isToday || alarm.time !== clock) continue;

    const occurrenceKey = alarm.repeat === "daily" ? date : alarm.date + " " + alarm.time;
    if (alarm.lastFiredKey === occurrenceKey) continue;

    alarm.lastFiredKey = occurrenceKey;
    if (alarm.repeat === "once") alarm.enabled = false;
    showNotice(alarm.label, "Alarm · " + alarm.time);
    changed = true;
  }

  if (changed) saveState();
}

function tick() {
  now.value = Date.now();

  if (timerEndAt.value && now.value >= timerEndAt.value) {
    timerEndAt.value = null;
    timerRemainingMs.value = 0;
    timerCompleted.value = true;
    timerIsPaused.value = false;
    saveState();
    showNotice("Timer finished", "Your countdown has reached zero.");
  }

  checkAlarms(new Date(now.value));
}

onMounted(() => {
  loadState();
  ticker = window.setInterval(tick, 250);
  tick();
});

onUnmounted(() => {
  if (ticker !== null) window.clearInterval(ticker);
});
</script>

<template>
  <section
    class="clock-tools"
    v-show="props.active"
  >
    <div class="clock-heading">
      <div>
        <h1>Clock tools</h1>
        <p>Timers, stopwatch and alarms in one place.</p>
      </div>
    </div>

    <nav
      class="clock-tabs"
      aria-label="Clock tools"
    >
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'timer' }"
        @click="activeTab = 'timer'"
      >Timer</button>
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'stopwatch' }"
        @click="activeTab = 'stopwatch'"
      >Stopwatch</button>
      <button
        type="button"
        :class="{ 'is-active': activeTab === 'alarm' }"
        @click="activeTab = 'alarm'"
      >Alarm</button>
    </nav>

    <section
      v-if="activeTab === 'timer'"
      class="clock-panel"
    >
      <p class="clock-kicker">COUNTDOWN TIMER</p>
      <div
        class="clock-readout"
        role="timer"
      >{{ formatTimer(timerDisplayMs) }}</div>
      <p
        v-if="timerCompleted"
        class="clock-status is-complete"
      >Time is up.</p>
      <p
        v-else-if="timerIsRunning"
        class="clock-status"
      >Timer is running</p>
      <p
        v-else
        class="clock-status"
      >Set a duration and start the countdown.</p>

      <div class="timer-inputs">
        <label>
          <span>Hours</span>
          <input
            v-model.number="timerHours"
            type="number"
            min="0"
            max="99"
            :disabled="timerIsRunning"
          />
        </label>
        <label>
          <span>Minutes</span>
          <input
            v-model.number="timerMinutes"
            type="number"
            min="0"
            max="59"
            :disabled="timerIsRunning"
          />
        </label>
        <label>
          <span>Seconds</span>
          <input
            v-model.number="timerSeconds"
            type="number"
            min="0"
            max="59"
            :disabled="timerIsRunning"
          />
        </label>
      </div>

      <div class="clock-actions">
        <button
          v-if="!timerIsRunning"
          type="button"
          class="primary"
          :disabled="(timerIsPaused ? timerRemainingMs : timerInputMs) <= 0"
          @click="startTimer"
        >
          {{ timerCompleted ? "Start again" : "Start" }}
        </button>
        <button
          v-else
          type="button"
          class="primary"
          @click="pauseTimer"
        >Pause</button>
        <button
          type="button"
          class="secondary"
          @click="resetTimer"
        >Reset</button>
      </div>
    </section>

    <section
      v-else-if="activeTab === 'stopwatch'"
      class="clock-panel"
    >
      <p class="clock-kicker">STOPWATCH</p>
      <div
        class="clock-readout"
        role="timer"
      >{{ formatStopwatch(stopwatchElapsedMs) }}</div>
      <p class="clock-status">{{ stopwatchIsRunning ? "Stopwatch is running" : "Measure elapsed time and record laps." }}</p>

      <div class="clock-actions">
        <button
          v-if="!stopwatchIsRunning"
          type="button"
          class="primary"
          @click="startStopwatch"
        >
          {{ stopwatchElapsedBeforeStart > 0 ? "Resume" : "Start" }}
        </button>
        <button
          v-else
          type="button"
          class="primary"
          @click="pauseStopwatch"
        >Pause</button>
        <button
          type="button"
          class="secondary"
          :disabled="!stopwatchIsRunning"
          @click="addLap"
        >Lap</button>
        <button
          type="button"
          class="secondary"
          :disabled="stopwatchIsRunning && stopwatchElapsedMs === 0"
          @click="resetStopwatch"
        >Reset</button>
      </div>

      <div
        v-if="stopwatchLaps.length"
        class="lap-list"
      >
        <div class="lap-heading"><span>Lap</span><span>Split</span><span>Total</span></div>
        <div
          v-for="lap in stopwatchLaps"
          :key="lap.number + '-' + lap.totalMs"
          class="lap-row"
        >
          <span>#{{ lap.number }}</span>
          <span>{{ formatStopwatch(lap.splitMs) }}</span>
          <span>{{ formatStopwatch(lap.totalMs) }}</span>
        </div>
      </div>
    </section>

    <section
      v-else
      class="clock-panel alarm-panel"
    >
      <p class="clock-kicker">ALARMS</p>
      <div class="alarm-create">
        <label class="alarm-label">
          <span>Alarm name</span>
          <input
            v-model="alarmLabel"
            maxlength="60"
            placeholder="e.g. Wake up"
          />
        </label>
        <div class="alarm-fields">
          <label>
            <span>Time</span>
            <input
              v-model="alarmTime"
              type="time"
              required
            />
          </label>
          <label>
            <span>Repeat</span>
            <select v-model="alarmRepeat">
              <option value="daily">Every day</option>
              <option value="once">Once</option>
            </select>
          </label>
        </div>
        <label
          v-if="alarmRepeat === 'once'"
          class="alarm-label"
        >
          <span>Date</span>
          <input
            v-model="alarmDate"
            type="date"
            :min="todayKey()"
          />
        </label>
        <button
          type="button"
          class="primary add-alarm"
          :disabled="!alarmTime || (alarmRepeat === 'once' && alarmDate < todayKey())"
          @click="addAlarm"
        >
          Add alarm
        </button>
      </div>

      <div class="alarm-list">
        <p
          v-if="!alarms.length"
          class="empty-alarms"
        >No alarms yet. Add an alarm above.</p>
        <article
          v-for="alarm in alarms"
          :key="alarm.id"
          class="alarm-item"
        >
          <div class="alarm-time">
            <strong>{{ alarm.time }}</strong>
            <span>{{ alarm.label }} · {{ alarm.repeat === "daily" ? "Every day" : alarm.date }}</span>
          </div>
          <div class="alarm-controls">
            <button
              type="button"
              class="alarm-toggle"
              :class="{ 'is-enabled': alarm.enabled }"
              @click="toggleAlarm(alarm)"
            >
              {{ alarm.enabled ? "On" : "Off" }}
            </button>
            <button
              type="button"
              class="delete-alarm"
              aria-label="Delete alarm"
              @click="deleteAlarm(alarm.id)"
            >×</button>
          </div>
        </article>
      </div>
    </section>
  </section>

  <Teleport to="body">
    <div
      v-if="notices.length"
      class="notice-backdrop"
      role="presentation"
    >
      <section
        class="notice-card"
        role="alertdialog"
        aria-modal="true"
      >
        <p class="clock-kicker">PAUSETTA ALERT</p>
        <article
          v-for="notice in notices"
          :key="notice.id"
          class="notice-item"
        >
          <h2>{{ notice.title }}</h2>
          <p>{{ notice.message }}</p>
          <button
            type="button"
            class="primary"
            @click="dismissNotice(notice.id)"
          >Dismiss</button>
        </article>
      </section>
    </div>
  </Teleport>
</template>

<style
  scoped
  lang="scss"
>
.clock-tools {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 16px;
  padding: 22px 18px 26px;
}

.clock-heading h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--text);
}

.clock-heading p {
  margin: 5px 0 0;
  font-size: 12.5px;
  color: var(--text2);
}

.clock-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  padding: 4px;
  border-radius: 10px;
  background: var(--field-bg);
}

.clock-tabs button {
  border: 0;
  border-radius: 7px;
  padding: 9px 4px;
  background: transparent;
  color: var(--text2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.clock-tabs button.is-active {
  background: var(--card);
  color: var(--text);
  box-shadow: var(--card-shadow);
}

.clock-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card);
  box-shadow: var(--card-shadow);
}

.clock-kicker {
  margin: 0;
  color: var(--text3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.clock-readout {
  text-align: center;
  color: var(--text);
  font-size: clamp(34px, 9vw, 48px);
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  letter-spacing: -0.045em;
  line-height: 1.2;
  padding: 12px 0 4px;
}

.clock-status {
  margin: 0;
  min-height: 18px;
  text-align: center;
  color: var(--text3);
  font-size: 11.5px;
}

.clock-status.is-complete {
  color: var(--switch-on);
  font-weight: 700;
}

.timer-inputs,
.alarm-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

.timer-inputs label,
.alarm-fields label,
.alarm-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--text2);
  font-size: 11px;
}

.timer-inputs input,
.alarm-fields input,
.alarm-fields select,
.alarm-label input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--field-border);
  border-radius: 8px;
  padding: 9px 7px;
  background: var(--field-bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.timer-inputs input:disabled {
  opacity: 0.55;
}

.clock-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.clock-actions button,
.primary,
.secondary {
  min-height: 36px;
  padding: 8px 17px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.primary {
  border: 1px solid transparent;
  background: var(--accent);
  color: #ffffff;
}

.secondary {
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text2);
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}

.lap-list {
  max-height: 230px;
  overflow: auto;
  margin-top: 3px;
  border-top: 1px solid var(--border);
}

.lap-heading,
.lap-row {
  display: grid;
  grid-template-columns: 0.7fr 1.2fr 1.2fr;
  gap: 8px;
  padding: 9px 2px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.lap-heading {
  color: var(--text3);
  font-weight: 700;
}

.lap-row {
  border-top: 1px solid var(--border);
  color: var(--text2);
}

.alarm-panel {
  padding: 17px 14px;
}

.alarm-create {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--bg);
}

.alarm-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.add-alarm {
  align-self: flex-end;
}

.alarm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-alarms {
  margin: 2px 0;
  color: var(--text3);
  font-size: 12px;
}

.alarm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.alarm-time {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.alarm-time strong {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: var(--text);
}

.alarm-time span {
  overflow: hidden;
  color: var(--text3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alarm-controls {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}

.alarm-toggle,
.delete-alarm {
  min-width: 34px;
  min-height: 30px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  padding: 5px 8px;
  background: transparent;
  color: var(--text2);
  font-size: 11px;
  cursor: pointer;
}

.alarm-toggle.is-enabled {
  border-color: var(--switch-on);
  color: var(--switch-on);
}

.delete-alarm {
  min-width: 30px;
  font-size: 18px;
}

.notice-backdrop {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 12, 11, 0.52);
  backdrop-filter: blur(5px);
}

.notice-card {
  width: min(390px, 100%);
  max-height: min(80vh, 600px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow);
}

.notice-item {
  padding: 15px 0;
  border-bottom: 1px solid var(--border);
}

.notice-item:last-child {
  border-bottom: 0;
}

.notice-item h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text);
}

.notice-item p {
  margin: 6px 0 13px;
  font-size: 12.5px;
  color: var(--text2);
}
</style>
