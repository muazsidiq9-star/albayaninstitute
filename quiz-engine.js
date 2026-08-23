/* ============================================================
   Al-Bayan  Institute Online
   quiz-engine.js — Quiz Engine v2.3 (Complete)
   Dual Badge System + Rewards Modal (Mobile-Optimized)
   Features: Difficulties, XP/Levels, Tiered Badges, Claimable
   Rewards, Leaderboard, Stats, Daily Challenge, Supabase Sync
============================================================ */

(function () {
  "use strict";

  const QUIZ_DATA_PATH = "./quizzes/";
  const params = new URLSearchParams(window.location.search);
  const quizId = params.get("id");

  const matric = sessionStorage.getItem("matric");

const isStudentLoggedIn =
  sessionStorage.getItem("role") === "student" &&
  !!matric;

const studentData = (() => {
  if (!isStudentLoggedIn) return null;

  try {
    return JSON.parse(
      sessionStorage.getItem("currentStudent")
    );
  } catch {
    return null;
  }
})();

  const state = {
    quiz: null, quizId: null, player: null, avatar: null, matric: matric || null,
    currentDifficulty: null, currentStage: null,
    questions: [], qIndex: 0, score: 0, streak: 0, bestStreak: 0,
    locked: false, xpGained: 0, stageStartTime: null,
    dailyQuestion: null, dailyLocked: false,
    newSimpleBadges: [], newTieredBadges: [],
    endless: null,
    // In-memory data cache used ONLY for logged-in students.
    // Never written to localStorage — hydrated once from Supabase
    // at init() and persisted back to Supabase on every change.
    // Guests never touch this; they keep using localStorage below.
    cache: null,
  };

  const AVATARS = ["🌸", "⭐", "🌙", "📖", "🕊️", "✨", "🌟", "💫"];

  const GRADES = [
    { min: 90, label: "Excellent", cls: "quiz-grade-Excellent", emoji: "🌟", message: "Excellent work! Your understanding is outstanding — keep this beautiful habit going." },
    { min: 75, label: "Very Good", cls: "quiz-grade-VeryGood", emoji: "🎉", message: "Very good! You clearly know this well. Just a little more polish and you'll reach perfection." },
    { min: 60, label: "Good", cls: "quiz-grade-Good", emoji: "👍", message: "Good job! You're doing well. A bit more revision and this will really stick." },
    { min: 50, label: "Fair", cls: "quiz-grade-Fair", emoji: "🙂", message: "Fair effort! You're on the right path — go over it once more." },
    { min: 0, label: "Needs Work", cls: "quiz-grade-Fail", emoji: "💪", message: "Don't worry, everyone starts somewhere! Take your time, revise, and try again." },
  ];

  const TIER_COLORS = {
    Bronze: "#CD7F32", Silver: "#C0C0C0", Gold: "#FFD700",
    Platinum: "#E5E4E2", Diamond: "#B9F2FF", Mastery: "#8B5CF6",
  };

  /* ---------- LEVEL MASTERY REWARDS (the real money reward) ----------
     Awarded once per difficulty when a student gets a PERFECT 3-star on the
     FINAL stage of that difficulty AND has at least 2 stars on every earlier
     stage in that same difficulty. Amount grows with difficulty order, so the
     last (hardest) level pays out the most. Edit the amounts below any time —
     they're matched to difficulty position, not by name, so this works
     whether a quiz has 3 levels or more. */
  const LEVEL_MASTERY_REWARDS = [500, 1000, 2000]; // ₦ — index 0 = 1st difficulty (e.g. Beginner)
  function getLevelMasteryAmount(diffIndex) {
    if (diffIndex < LEVEL_MASTERY_REWARDS.length) return LEVEL_MASTERY_REWARDS[diffIndex];
    // If a quiz ever has more difficulties than we've priced, keep scaling up
    // using the gap between the last two configured amounts.
    const last = LEVEL_MASTERY_REWARDS[LEVEL_MASTERY_REWARDS.length - 1];
    const prev = LEVEL_MASTERY_REWARDS[LEVEL_MASTERY_REWARDS.length - 2] || 0;
    const step = last - prev;
    return last + step * (diffIndex - LEVEL_MASTERY_REWARDS.length + 1);
  }

  /* ---------- SIMPLE BADGES (One-off fun achievements) ---------- */
  const SIMPLE_BADGES = [
    { id: "first_steps", icon: "👣", name: "First Steps", desc: "Complete your first stage" },
    { id: "first_perfect", icon: "⭐", name: "First Perfect", desc: "Get 3 stars on any stage for the first time" },
    { id: "first_daily", icon: "🌅", name: "Daily Starter", desc: "Complete your first daily challenge" },
    { id: "first_share", icon: "📢", name: "Spread the Word", desc: "Share your score for the first time" },
    { id: "night_owl", icon: "🌙", name: "Night Owl", desc: "Play after 8 PM" },
    { id: "early_bird", icon: "🐦", name: "Early Bird", desc: "Play before 6 AM" },
    { id: "weekend_warrior", icon: "🛡️", name: "Weekend Warrior", desc: "Play on a Saturday or Sunday" },
    { id: "comeback_kid", icon: "🔄", name: "Comeback Kid", desc: "Return after 7 days of not playing" },
    { id: "speed_runner", icon: "⚡", name: "Speed Runner", desc: "Finish a stage in under 60 seconds" },
    { id: "marathoner", icon: "🏃", name: "Marathoner", desc: "Complete 5 stages in one day" },
    { id: "collector", icon: "🗝️", name: "Key Collector", desc: "Unlock every stage in a difficulty" },
    { id: "loyal_student", icon: "📅", name: "Loyal Student", desc: "Play on 10 different days" },
    { id: "dedicated", icon: "💎", name: "Dedicated", desc: "Play on 30 different days" },
    { id: "perfectionist", icon: "🎯", name: "Perfectionist", desc: "Earn 3 stars on 10 different stages" },
    { id: "scholar", icon: "📈", name: "Scholar", desc: "Reach Level 5" },
    { id: "master", icon: "👑", name: "Master", desc: "Reach Level 10" },
    { id: "legend", icon: "🏔️", name: "Legend", desc: "Reach Level 20" },
    { id: "explorer", icon: "🧭", name: "Explorer", desc: "Try all difficulties in a quiz" },
    { id: "streak_5", icon: "🔥", name: "On Fire", desc: "Get 5 correct answers in a row" },
    { id: "streak_10", icon: "⚡", name: "Unstoppable", desc: "Get 10 correct answers in a row" },
    { id: "streak_25", icon: "🌋", name: "Volcanic", desc: "Get 25 correct answers in a row" },
    { id: "retry_king", icon: "♻️", name: "Retry King", desc: "Retry the same stage 5 times" },
    { id: "helper", icon: "🤝", name: "Helper", desc: "Share your score 3 times" },
    { id: "mastery_seeker", icon: "🎓", name: "Mastery Seeker", desc: "Claim your first mastery reward" },
  ];

  /* ---------- TIERED BADGES (5 phases each — the endless climb) ---------- */
  const TIERED_BADGES = [
  {
    id: "streak_master", name: "Streak Master", desc: "Correct answers in a row", icon: "🔥", metric: "bestStreak",
    tiers: [
      { level: 1, label: "Bronze", threshold: 5, rewardType: "title", rewardValue: "Steady Learner" },
      { level: 2, label: "Silver", threshold: 10, rewardType: "title", rewardValue: "Focused Mind" },
      { level: 3, label: "Gold", threshold: 25, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 50, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "daily_devotion", name: "Daily Devotion", desc: "Daily challenges completed", icon: "🌟", metric: "dailyCount",
    tiers: [
      { level: 1, label: "Bronze", threshold: 3, rewardType: "title", rewardValue: "Early Bird" },
      { level: 2, label: "Silver", threshold: 7, rewardType: "title", rewardValue: "Consistent Soul" },
      { level: 3, label: "Gold", threshold: 30, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 365, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "stage_crusher", name: "Stage Crusher", desc: "Stages completed", icon: "🏔️", metric: "stagesCompleted",
    tiers: [
      { level: 1, label: "Bronze", threshold: 5, rewardType: "title", rewardValue: "Beginner" },
      { level: 2, label: "Silver", threshold: 20, rewardType: "title", rewardValue: "Climber" },
      { level: 3, label: "Gold", threshold: 50, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 200, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "perfect_scorer", name: "Perfect Scorer", desc: "Stages with 3 stars", icon: "⭐", metric: "perfectStages",
    tiers: [
      { level: 1, label: "Bronze", threshold: 1, rewardType: "title", rewardValue: "Perfectionist" },
      { level: 2, label: "Silver", threshold: 5, rewardType: "title", rewardValue: "Excellence" },
      { level: 3, label: "Gold", threshold: 22, rewardType: "discount", rewardValue: 200 },
      { level: 4, label: "Platinum", threshold: 30, rewardType: "discount", rewardValue: 500 },
      { level: 5, label: "Diamond", threshold: 50, rewardType: "discount", rewardValue: 1000 },
    ]
  },

  {
    id: "scholar_of_the_book", name: "Scholar of the Book", desc: "Full difficulties completed", icon: "📖", metric: "difficultiesCompleted",
    tiers: [
      { level: 1, label: "Bronze", threshold: 1, rewardType: "title", rewardValue: "Reader" },
      { level: 2, label: "Silver", threshold: 3, rewardType: "title", rewardValue: "Dedicated Student" },
      { level: 3, label: "Gold", threshold: 5, rewardType: "discount", rewardValue: 200 },
      { level: 4, label: "Platinum", threshold: 10, rewardType: "discount", rewardValue: 500 },
      { level: 5, label: "Diamond", threshold: 20, rewardType: "discount", rewardValue: 1000 },
    ]
  },

  {
    id: "persistent", name: "Persistent", desc: "Stage retries", icon: "💪", metric: "totalRetries",
    tiers: [
      { level: 1, label: "Bronze", threshold: 5, rewardType: "title", rewardValue: "Never Gives Up" },
      { level: 2, label: "Silver", threshold: 15, rewardType: "title", rewardValue: "Determined" },
      { level: 3, label: "Gold", threshold: 30, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 60, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "quiz_master", name: "Quiz Master", desc: "Total quiz attempts", icon: "🎓", metric: "totalAttempts",
    tiers: [
      { level: 1, label: "Bronze", threshold: 5, rewardType: "title", rewardValue: "Curious" },
      { level: 2, label: "Silver", threshold: 15, rewardType: "title", rewardValue: "Dedicated" },
      { level: 3, label: "Gold", threshold: 30, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 60, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "speed_demon", name: "Speed Demon", desc: "Fast stage completions (seconds)", icon: "⚡", metric: "bestSpeed",
    tiers: [
      { level: 1, label: "Bronze", threshold: 120, rewardType: "title", rewardValue: "Swift" },
      { level: 2, label: "Silver", threshold: 90, rewardType: "title", rewardValue: "Quick Thinker" },
      { level: 3, label: "Gold", threshold: 60, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 45, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 30, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "night_owl", name: "Midnight Scholar", desc: "Late night study sessions", icon: "🌙", metric: "nightPlays",
    tiers: [
      { level: 1, label: "Bronze", threshold: 3, rewardType: "title", rewardValue: "Night Reader" },
      { level: 2, label: "Silver", threshold: 10, rewardType: "title", rewardValue: "Moonlight Scholar" },
      { level: 3, label: "Gold", threshold: 30, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 60, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
    ]
  },

  {
    id: "community_helper", name: "Community Helper", desc: "Shares to WhatsApp", icon: "📢", metric: "shareCount",
    tiers: [
      { level: 1, label: "Bronze", threshold: 3, rewardType: "title", rewardValue: "Helper" },
      { level: 2, label: "Silver", threshold: 10, rewardType: "title", rewardValue: "Influencer" },
      { level: 3, label: "Gold", threshold: 25, rewardType: "title", rewardValue: "Achiever" },
      { level: 4, label: "Platinum", threshold: 50, rewardType: "title", rewardValue: "Achiever" },
      { level: 5, label: "Diamond", threshold: 100, rewardType: "title", rewardValue: "Achiever" },
    ]
  },
];

const HALL_OF_FAME = [
  { name: "Fatima", avatar: "🌸", xp: 2840, level: 8, quizzes: 12, matric: "SEED001" },
  { name: "Omar", avatar: "🌙", xp: 3120, level: 9, quizzes: 15, matric: "SEED002" },
  { name: "Aisha", avatar: "⭐", xp: 1950, level: 6, quizzes: 8, matric: "SEED003" },
  { name: "Bilal", avatar: "🕊️", xp: 1580, level: 5, quizzes: 7, matric: "SEED004" },
  { name: "Khadijah", avatar: "📖", xp: 2450, level: 7, quizzes: 11, matric: "SEED005" },
];

  /* ================= HELPERS ================= */
  function getGrade(pct) { return GRADES.find((g) => pct >= g.min); }
  function xpForLevel(level) { return level * 200; }
  function getLevel(xp) {
    let level = 1, total = 0;
    while (total + xpForLevel(level) <= xp) { total += xpForLevel(level); level++; }
    return { level, current: xp - total, needed: xpForLevel(level) };
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function showScreen(id) {
    document.querySelectorAll(".quiz-screen").forEach((s) => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateStarPointsUI() {

  const points = getXPData().starPoints || 0;

  const elements = [
    "quiz-welcome-star-points",
    "quiz-bar-star-points",
    "quiz-endless-star-points",
    "stat-star-points",
    "quiz-shop-star-points"
  ];

  elements.forEach((id) => {
    const el = document.getElementById(id);

    if (el) {
      el.textContent = points;
    }
  });
}
  function storageKey(suffix) { return `quiz_${state.quizId}_${suffix}`; }
  function globalKey(suffix) { return `quiz_global_${suffix}`; }
  function getSupabase() { return window.sb || null; }

  /* ================= DATA NORMALIZATION ================= */
  function normalizeQuizData(quiz) {
    if (quiz.difficulties) return quiz;
    return { ...quiz, difficulties: [{ id: "standard", label: "Standard", icon: quiz.icon || "📘", description: "The classic challenge", stages: quiz.stages || [] }] };
  }

  /* ================= DEFAULT SHAPES ================= */
  function defaultXPData() {
    return { xp: 0, starPoints: 0, simpleBadges: [], badgeTiers: {}, dailyCount: 0, dailyDate: null, nightPlays: 0, shareCount: 0, attempts: {}, daysPlayed: [], maxStagesDay: 0, claimedRewards: 0, lastPlayDate: null, levelMastery: {} };
  }
  function normalizeXPData(d) {
    if (!d.simpleBadges) d.simpleBadges = [];
    if (!d.badgeTiers) d.badgeTiers = {};
    if (typeof d.starPoints !== "number") d.starPoints = 0;
    if (!d.nightPlays) d.nightPlays = 0;
    if (!d.shareCount) d.shareCount = 0;
    if (!d.daysPlayed) d.daysPlayed = [];
    if (!d.maxStagesDay) d.maxStagesDay = 0;
    if (!d.claimedRewards) d.claimedRewards = 0;
    if (!d.lastPlayDate) d.lastPlayDate = null;
    if (!d.levelMastery) d.levelMastery = {};
    if (!d.attempts) d.attempts = {};
    if (!d.dailyCount) d.dailyCount = 0;
    return d;
  }

  /* ================= STUDENT CACHE (Supabase-backed, in-memory only) =================
     Logged-in students NEVER touch localStorage. Everything lives in state.cache,
     hydrated once from quiz_players.local_data at init(), and every write is
     mirrored back to Supabase (debounced) so nothing is lost on refresh/logout. */
  let persistTimer = null;
  function ensureQuizBucket(quizId) {
    if (!state.cache.quizzes[quizId]) {
      state.cache.quizzes[quizId] = { stars: {}, best: {}, records: [], endlessHigh: 0 };
    }
    return state.cache.quizzes[quizId];
  }
  function getEndlessHigh() {
    if (isStudentLoggedIn) return ensureQuizBucket(state.quizId).endlessHigh || 0;
    return parseInt(localStorage.getItem(storageKey("endlessHigh")) || "0", 10);
  }
  function setEndlessHigh(score) {
    if (isStudentLoggedIn) {
      ensureQuizBucket(state.quizId).endlessHigh = score;
      persistStudentCache();
      return;
    }
    localStorage.setItem(storageKey("endlessHigh"), String(score));
  }
  function describeSbError(error) {
    if (!error) return "Unknown error";
    return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
  }
  function persistStudentCache() {
    if (!isStudentLoggedIn) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      const sb = getSupabase();
      if (!sb || !state.matric) return;
      try {
        const { error } = await sb.from("quiz_players")
          .update({ local_data: state.cache })
          .eq("matric_number", state.matric);
        if (error) console.error("[STUDENT CACHE] Failed to persist:", describeSbError(error));
      } catch (err) {
        console.error("[STUDENT CACHE] Unexpected persist error:", err && err.message ? err.message : err);
      }
    }, 600);
  }
  async function loadStudentCache() {
    state.cache = { global: defaultXPData(), quizzes: {} };
    const sb = getSupabase();
    if (!sb || !state.matric) return;

    try {
      const { data, error } = await sb.from("quiz_players")
        .select("*")
        .eq("matric_number", state.matric)
        .maybeSingle();

      if (error) {
        console.error("[STUDENT CACHE] Failed to load:", describeSbError(error));
        return;
      }

      if (data) {
        // Hydrate the JSONB blob (per-quiz stars/best/records + the local-only
        // xp extras that don't have their own quiz_players columns).
        if (data.local_data && typeof data.local_data === "object") {
          if (data.local_data.global) Object.assign(state.cache.global, data.local_data.global);
          if (data.local_data.quizzes) state.cache.quizzes = data.local_data.quizzes;
        }
        // quiz_players' own columns are the source of truth for these —
        // always override whatever local_data had, in case they've since
        // been updated elsewhere (e.g. directly via syncScoreToSupabase).
        state.cache.global.xp = Number(data.total_xp) || 0;
        state.cache.global.starPoints = Number(data.star_points) || 0;
        state.cache.global.simpleBadges = data.badges || [];
        state.cache.global.badgeTiers = data.badge_tiers || {};
        state.cache.global.dailyCount = data.daily_count || 0;
        state.cache.global.dailyDate = data.daily_date || null;
      }

      normalizeXPData(state.cache.global);

      // Self-heal: if this quiz's bucket is empty (new local_data column,
      // or it was reset), rebuild stars/best/endlessHigh straight from the
      // permanent attempt history in quiz_scores so nothing looks "lost".
      const bucket = ensureQuizBucket(state.quizId);
      const bucketIsEmpty =
        Object.keys(bucket.stars).length === 0 &&
        Object.keys(bucket.best).length === 0 &&
        !bucket.endlessHigh;
      if (bucketIsEmpty) {
        await backfillQuizProgressFromScores(state.quizId);
      }
    } catch (err) {
      console.error("[STUDENT CACHE] Unexpected load error:", err && err.message ? err.message : err);
    }
  }

  async function backfillQuizProgressFromScores(quizId) {
    const sb = getSupabase();
    if (!sb || !state.matric) return;
    try {
      const { data, error } = await sb.from("quiz_scores")
        .select("difficulty_id, stage_id, score, total_questions, stars")
        .eq("matric_number", state.matric)
        .eq("quiz_id", quizId);

      if (error) {
        console.error("[STUDENT CACHE] Failed to backfill from quiz_scores:", describeSbError(error));
        return;
      }
      if (!data || !data.length) return;

      const bucket = ensureQuizBucket(quizId);
      data.forEach((row) => {
        if (row.difficulty_id === "endless") {
          bucket.endlessHigh = Math.max(bucket.endlessHigh || 0, row.score || 0);
          return;
        }
        if (row.difficulty_id === "daily") return; // daily tracked separately, not per-stage
        const key = `${row.difficulty_id}:${row.stage_id}`;
        bucket.stars[key] = Math.max(bucket.stars[key] || 0, row.stars || 0);
        const pct = row.total_questions ? row.score / row.total_questions : 0;
        const prevBest = bucket.best[key];
        const prevPct = prevBest && prevBest.total ? prevBest.correct / prevBest.total : -1;
        if (!prevBest || pct > prevPct) {
          bucket.best[key] = { correct: row.score, total: row.total_questions };
        }
      });

      persistStudentCache(); // save the rebuilt cache so this only runs once
    } catch (err) {
      console.error("[STUDENT CACHE] Unexpected backfill error:", err && err.message ? err.message : err);
    }
  }

  /* ================= DATA ACCESS (branches: student → cache/Supabase, guest → localStorage) ================= */
  function getStars() {
    if (isStudentLoggedIn) return { ...ensureQuizBucket(state.quizId).stars };
    return JSON.parse(localStorage.getItem(storageKey("stars")) || "null") || {};
  }
  function setStars(stars) {
    if (isStudentLoggedIn) {
      ensureQuizBucket(state.quizId).stars = stars;
      persistStudentCache();
      return;
    }
    localStorage.setItem(storageKey("stars"), JSON.stringify(stars));
  }
  function getBest() {
    if (isStudentLoggedIn) return { ...ensureQuizBucket(state.quizId).best };
    return JSON.parse(localStorage.getItem(storageKey("best")) || "null") || {};
  }
  function setBest(best) {
    if (isStudentLoggedIn) {
      ensureQuizBucket(state.quizId).best = best;
      persistStudentCache();
      return;
    }
    localStorage.setItem(storageKey("best"), JSON.stringify(best));
  }
  function getRecords() {
    if (isStudentLoggedIn) return [...ensureQuizBucket(state.quizId).records];
    return JSON.parse(localStorage.getItem(storageKey("records")) || "null") || [];
  }
  function addRecord(rec) {
    const records = getRecords();
    records.unshift({ ...rec, date: new Date().toISOString() });
    if (records.length > 50) records.pop();
    if (isStudentLoggedIn) {
      ensureQuizBucket(state.quizId).records = records;
      persistStudentCache();
      return;
    }
    localStorage.setItem(storageKey("records"), JSON.stringify(records));
  }
  function getXPData() {
    if (isStudentLoggedIn) return { ...state.cache.global };
    const raw = localStorage.getItem(globalKey("xp"));
    if (raw) return normalizeXPData(JSON.parse(raw));
    return defaultXPData();
  }
  function setXPData(data) {
    if (isStudentLoggedIn) {
      state.cache.global = data;
      persistStudentCache();
      return;
    }
    localStorage.setItem(globalKey("xp"), JSON.stringify(data));
  }

  /* ================= STAR POINTS WALLET ================= */

/**
 * Add Star Points to the student's persistent Supabase wallet.
 *
 * - LocalStorage remains the immediate UI/cache.
 * - Supabase receives only the amount earned.
 * - Guests continue using localStorage only.
 *
 * Returns the new Supabase balance when successful,
 * or null when the student is not connected to Supabase.
 */
async function addStarPoints(amount) {
  const points = Number(amount);

  if (!Number.isFinite(points) || points <= 0) {
    console.warn("[STAR POINTS] Invalid amount:", amount);
    return null;
  }

  const sb = getSupabase();

  // Guest / offline mode:
  // localStorage remains the only storage.
  if (!sb || !isStudentLoggedIn) {
    return null;
  }

  try {
    const { data, error } = await sb.rpc("update_star_points", {
      p_matric_number: state.matric,
      p_amount: Math.floor(points)
    });

    if (error) throw error;

    const newBalance = Number(data);

    if (!Number.isFinite(newBalance)) {
      throw new Error("Invalid Star Points balance returned by Supabase");
    }

    // Keep the in-memory/local cache synchronized with the database.
    const xpData = getXPData();
    xpData.starPoints = newBalance;
    setXPData(xpData);

    updateStarPointsUI();

    console.log(
      `[STAR POINTS] +${Math.floor(points)} ✨ → balance: ${newBalance}`
    );

    return newBalance;

  } catch (err) {
    console.error("[STAR POINTS] Failed to add points:", err);
    return null;
  }
}

/* ================= SPEND STAR POINTS ================= */

/**
 * Spend Star Points from the student's persistent Supabase wallet.
 *
 * The RPC receives a negative amount so the deduction happens
 * atomically inside Supabase.
 *
 * Returns the new Supabase balance when successful.
 * Returns null when the purchase cannot be completed.
 */
async function spendStarPoints(amount) {
  const points = Number(amount);

  if (!Number.isFinite(points) || points <= 0) {
    console.warn("[STAR POINTS] Invalid spending amount:", amount);
    return null;
  }

  const sb = getSupabase();

  // Guests use localStorage only.
  if (!sb || !isStudentLoggedIn) {
    const xpData = getXPData();
    const current = xpData.starPoints || 0;

    if (current < points) {
      return null;
    }

    const newBalance = current - points;

    xpData.starPoints = newBalance;
    setXPData(xpData);
    updateStarPointsUI();

    return newBalance;
  }

  try {
    const { data, error } = await sb.rpc("update_star_points", {
      p_matric_number: state.matric,
      p_amount: -Math.floor(points)
    });

    if (error) throw error;

    const newBalance = Number(data);

    if (!Number.isFinite(newBalance) || newBalance < 0) {
      throw new Error("Invalid Star Points balance returned by Supabase");
    }

    // Keep the in-memory/local cache synchronized with the database.
    const xpData = getXPData();
    xpData.starPoints = newBalance;
    setXPData(xpData);

    updateStarPointsUI();

    console.log(
      `[STAR POINTS] -${Math.floor(points)} ✨ → balance: ${newBalance}`
    );

    return newBalance;

  } catch (err) {
    console.error("[STAR POINTS] Failed to spend points:", err);
    return null;
  }
}

  function getDeviceLeaderboard() { return JSON.parse(localStorage.getItem(globalKey("leaderboard")) || "null") || []; }
  function setDeviceLeaderboard(lb) { localStorage.setItem(globalKey("leaderboard"), JSON.stringify(lb)); }
  function getRetryCount(stageKey) {
    const data = getXPData();
    return (data.attempts && data.attempts[stageKey]) || 0;
  }
  function incrementRetryCount(stageKey) {
    const data = getXPData();
    if (!data.attempts) data.attempts = {};
    data.attempts[stageKey] = (data.attempts[stageKey] || 0) + 1;
    setXPData(data);
  }

  /* ================= SUPABASE SYNC ================= */

async function syncScoreToSupabase(scoreData, options = {}) {
  const countAsQuiz = options.countAsQuiz !== false;
  const isDaily = options.isDaily === true;
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn) {
    console.warn("[SUPABASE] Sync skipped: no client or matric number.");
    return false;
  }

  try {

    /* ================= SAVE QUIZ ATTEMPT ================= */

    const { error: scoreError } = await sb
      .from("quiz_scores")
      .insert({
        matric_number: state.matric,
        quiz_id: state.quizId,
        difficulty_id: scoreData.difficultyId,
        stage_id: scoreData.stageId,
        score: scoreData.score,
        total_questions: scoreData.total,
        stars: scoreData.stars,
        xp_gained: scoreData.xpGained,
        best_streak: scoreData.bestStreak,
      });

    if (scoreError) {
      console.error(
        "[SUPABASE] Failed to save quiz attempt:",
        scoreError
      );

      return false;
    }


    /* ================= LOAD PLAYER ================= */

    const { data: existing, error: playerFetchError } = await sb
      .from("quiz_players")
      .select("*")
      .eq("matric_number", state.matric)
      .maybeSingle();

    if (playerFetchError) {
      console.error(
        "[SUPABASE] Failed to load player:",
        playerFetchError
      );

      return false;
    }


    /* ================= CALCULATE PLAYER TOTALS ================= */

    const newTotalXP =
      (existing?.total_xp || 0) + scoreData.xpGained;

    const newLevel =
      getLevel(newTotalXP).level;

    const newQuizzes =
  (existing?.quizzes_completed || 0) +
  (countAsQuiz ? 1 : 0);

const newCorrect =
  (existing?.total_correct || 0) +
  (countAsQuiz ? scoreData.score : 0);

const newQuestions =
  (existing?.total_questions || 0) +
  (countAsQuiz ? scoreData.total : 0);

const newBestStreak =
  countAsQuiz
    ? Math.max(
        existing?.best_streak || 0,
        scoreData.bestStreak
      )
    : (existing?.best_streak || 0);
     
    const newDailyCount =
  isDaily
    ? (existing?.daily_count || 0) + 1
    : (existing?.daily_count || 0);

const newDailyDate =
  isDaily
    ? new Date().toISOString().slice(0, 10)
    : existing?.daily_date || null;


    /* ================= MERGE BADGES ================= */

    const currentSimple =
      new Set(existing?.badges || []);

    scoreData.newSimpleBadges.forEach((badge) => {
      currentSimple.add(badge);
    });

    const currentTiers =
      existing?.badge_tiers || {};

    const mergedTiers = {
      ...currentTiers
    };

    scoreData.newTieredBadges.forEach((tier) => {
      mergedTiers[tier.badgeId] = Math.max(
        mergedTiers[tier.badgeId] || 0,
        tier.level
      );
    });


    /* ================= UPDATE PLAYER ================= */

    const { error: playerUpsertError } = await sb
      .from("quiz_players")
      .upsert(
        {
          matric_number: state.matric,
          full_name: state.player,
          total_xp: newTotalXP,
          level: newLevel,
          badges: Array.from(currentSimple),
          badge_tiers: mergedTiers,
          quizzes_completed: newQuizzes,
          total_correct: newCorrect,
          total_questions: newQuestions,
          best_streak: newBestStreak,
          daily_count: newDailyCount,
          daily_date: newDailyDate,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "matric_number"
        }
      );

    if (playerUpsertError) {
      console.error(
        "[SUPABASE] Failed to update player stats:",
        playerUpsertError
      );

      return false;
    }


    /* ================= SAVE TIERED REWARDS ================= */

    for (const tier of scoreData.newTieredBadges) {

      const def =
        TIERED_BADGES.find(
          (badge) => badge.id === tier.badgeId
        );

      if (!def) {
        console.warn(
          "[SUPABASE] Badge definition not found:",
          tier.badgeId
        );
        continue;
      }

      const tierDef =
        def.tiers.find(
          (item) => item.level === tier.level
        );

      if (!tierDef) {
        console.warn(
          "[SUPABASE] Badge tier definition not found:",
          tier
        );
        continue;
      }

      const { error: rewardError } = await sb
        .from("student_rewards")
        .insert({
          matric_number: state.matric,
          badge_id: tier.badgeId,
          badge_name: def.name,
          tier: tierDef.label,
          tier_num: tierDef.level,
          reward_type: tierDef.rewardType,
          reward_value: String(tierDef.rewardValue),
          status:
            tierDef.rewardType === "title"
              ? "approved"
              : "unclaimed",
        });

      if (rewardError) {
        console.error(
          "[SUPABASE] Failed to save tiered reward:",
          rewardError
        );

        return false;
      }
    }


    /* ================= SAVE MASTERY REWARDS ================= */

    for (const mastery of (
      scoreData.newMasteryRewards || []
    )) {

      const { error: masteryRewardError } =
        await sb
          .from("student_rewards")
          .insert({
            matric_number: state.matric,
            badge_id: `level_mastery_${mastery.diffId}`,
            badge_name: `${mastery.diffLabel} Mastery`,
            tier: "Mastery",
            tier_num: 99,
            reward_type: "discount",
            reward_value: String(mastery.amount),
            status: "unclaimed",
          });

      if (masteryRewardError) {
        console.error(
          "[SUPABASE] Failed to save mastery reward:",
          masteryRewardError
        );

        return false;
      }
    }


    /* ================= SUCCESS ================= */

    return true;

  } catch (err) {

    console.error(
      "[SUPABASE] Unexpected sync error:",
      err
    );

    return false;
  }
}

  /* ================= CURRENT QUIZ LEADERBOARD ================= */

async function fetchSupabaseLeaderboard() {
  const sb = getSupabase();

  if (!sb || !state.quizId) return null;

  try {
    /*
     * Load attempts for the current quiz.
     * The leaderboard is therefore course-specific.
     */
    const { data: scores, error: scoresError } = await sb
  .from("quiz_scores")
  .select(`
    matric_number,
    xp_gained,
    total_questions,
    score,
    best_streak,
    difficulty_id
  `)
  .eq("quiz_id", state.quizId)
  .neq("difficulty_id", "daily")
  .neq("difficulty_id", "endless");

    if (scoresError) throw scoresError;

    if (!scores || !scores.length) return [];

    /*
     * Group all attempts by student.
     */
    const students = {};

    scores.forEach((row) => {
      const matric = row.matric_number;

      if (!matric) return;

      if (!students[matric]) {
        students[matric] = {
          matric,
          xp: 0,
          quizzes: 0,
          correct: 0,
          questions: 0,
          streak: 0
        };
      }

      const student = students[matric];

/*
 * This leaderboard contains NORMAL quiz attempts only.
 *
 * Daily Challenge and Endless Mode have already
 * been excluded from the database query above.
 */

student.xp += row.xp_gained || 0;

student.quizzes++;

student.correct += row.score || 0;

student.questions += row.total_questions || 0;

student.streak = Math.max(
  student.streak,
  row.best_streak || 0
);
    });

    /*
     * Load names from quiz_players.
     * quiz_scores contains the performance history,
     * while quiz_players contains the student's display name.
     */
    const matricNumbers = Object.keys(students);

    const { data: players, error: playersError } = await sb
      .from("quiz_players")
      .select("matric_number, full_name")
      .in("matric_number", matricNumbers);

    if (playersError) throw playersError;

    const names = {};

    (players || []).forEach((player) => {
      names[player.matric_number] =
        player.full_name || player.matric_number;
    });

    /*
     * Convert grouped students into leaderboard entries.
     */
    const entries = Object.values(students)
      .map((student) => ({
        ...student,

        name:
          names[student.matric] ||
          student.matric,

        level:
          getLevel(student.xp).level,

        avatar:
          AVATARS[
            (student.matric?.length || 0) %
            AVATARS.length
          ]
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 20);

    /*
     * Add ranking and "You" marker after sorting.
     */
    return entries.map((student, index) => ({
      rank: index + 1,
      name: student.name,
      matric: student.matric,
      xp: student.xp,
      level: student.level,
      quizzes: student.quizzes,
      streak: student.streak,
      avatar: student.avatar,
      isYou: student.matric === state.matric
    }));

  } catch (err) {
    console.error(
      "[LB] Current quiz leaderboard fetch failed:",
      err
    );

    return null;
  }
}

  async function fetchSupabasePlayerStats() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn) return null;

  try {
    const { data, error } = await sb
      .from("quiz_players")
      .select("*")
      .eq("matric_number", state.matric)
      .single();

    if (error || !data) return null;

    return {
      xp: data.total_xp,
      level: data.level,

      badges: data.badges || [],
      badgeTiers: data.badge_tiers || {},

      quizzes: data.quizzes_completed,
      correct: data.total_correct,
      questions: data.total_questions,
      bestStreak: data.best_streak,

      // Daily Challenge statistics
      dailyCount: data.daily_count || 0,
      dailyDate: data.daily_date || null,

      // Current Star Points wallet
      starPoints: data.star_points || 0
    };

  } catch (err) {

    console.error(
      "[STATS] Failed to load player statistics:",
      err
    );

    return null;
  }
}

/* ================= SUPABASE RECENT ATTEMPTS ================= */

async function fetchSupabaseRecentAttempts(limit = 15) {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn) return [];

  try {
    const { data, error } = await sb
      .from("quiz_scores")
      .select(`
        id,
        quiz_id,
        difficulty_id,
        stage_id,
        score,
        total_questions,
        stars,
        xp_gained,
        best_streak,
        created_at
      `)
      .eq("matric_number", state.matric)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error(
        "[STATS] Failed to load recent attempts:",
        error
      );

      return [];
    }

    return data || [];

  } catch (err) {

    console.error(
      "[STATS] Recent attempts error:",
      err
    );

    return [];
  }
}

/* ================= CURRENT QUIZ STATS ================= */

async function fetchCurrentQuizStats() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn || !state.quizId) return null;

  try {
    const { data, error } = await sb
      .from("quiz_scores")
      .select(`
        score,
        total_questions,
        xp_gained,
        best_streak,
        difficulty_id
      `)
      .eq("matric_number", state.matric)
      .eq("quiz_id", state.quizId);

    if (error) throw error;

    const records = data || [];

    /*
     * Normal quiz attempts:
     * - daily is a separate daily task
     * - endless uses score as points, not correct answers
     */
    const quizAttempts = records.filter(
      (row) =>
        row.difficulty_id !== "daily" &&
        row.difficulty_id !== "endless"
    );

    /*
     * Records that contain real question/answer accuracy.
     * Daily is a genuine question-based challenge,
     * so it can contribute to questions and accuracy.
     * Endless is excluded because its score is not
     * a correct-answer count.
     */
    const accuracyRecords = records.filter(
      (row) => row.difficulty_id !== "endless"
    );

    const totalXP = records.reduce(
      (total, row) =>
        total + (row.xp_gained || 0),
      0
    );

    const totalCorrect = accuracyRecords.reduce(
      (total, row) =>
        total + (row.score || 0),
      0
    );

    const totalQuestions = accuracyRecords.reduce(
      (total, row) =>
        total + (row.total_questions || 0),
      0
    );

    const bestStreak = accuracyRecords.reduce(
      (best, row) =>
        Math.max(
          best,
          row.best_streak || 0
        ),
      0
    );

    const accuracy =
      totalQuestions > 0
        ? Math.round(
            (totalCorrect / totalQuestions) * 100
          )
        : 0;

    return {
      totalXP,
      quizzesDone: quizAttempts.length,
      totalCorrect,
      totalQuestions,
      accuracy,
      bestStreak
    };

  } catch (err) {
    console.error(
      "[STATS] Failed to load current quiz stats:",
      err
    );

    return null;
  }
}

/* ================= CURRENT QUIZ COURSE PROGRESS ================= */

function getCurrentQuizProgress() {
  if (!state.quiz || !state.quiz.difficulties) {
    return null;
  }

  const stars = getStars();

  let totalStages = 0;
  let completedStages = 0;
  let earnedStars = 0;
  let maxStars = 0;

  state.quiz.difficulties.forEach((difficulty) => {
    const stages = difficulty.stages || [];

    totalStages += stages.length;
    maxStars += stages.length * 3;

    stages.forEach((stage) => {
      const key = `${difficulty.id}:${stage.id}`;
      const stageStars = Number(stars[key] || 0);

      earnedStars += Math.min(stageStars, 3);

      if (stageStars > 0) {
        completedStages++;
      }
    });
  });

  const percentage =
    totalStages > 0
      ? Math.round((completedStages / totalStages) * 100)
      : 0;

  return {
    totalStages,
    completedStages,
    earnedStars,
    maxStars,
    percentage
  };
}

/* ================= CURRENT QUIZ ATTEMPTS ================= */

async function fetchCurrentQuizAttempts(limit = 15) {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn || !state.quizId) return null;

  try {
    const { data, error } = await sb
      .from("quiz_scores")
      .select(`
        id,
        quiz_id,
        difficulty_id,
        stage_id,
        score,
        total_questions,
        stars,
        xp_gained,
        best_streak,
        created_at
      `)
      .eq("matric_number", state.matric)
      .eq("quiz_id", state.quizId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];

  } catch (err) {
    console.error(
      "[STATS] Failed to load current quiz attempts:",
      err
    );

    return null;
  }
}

/* ================= SUPABASE ACTIVITY CHART ================= */

async function fetchSupabaseActivityCounts() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn) return null;

  try {
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);

      days.push({
        label: d.toLocaleDateString("en", {
          weekday: "short"
        }),
        date: d.toDateString(),
        count: 0
      });
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 6);

    const { data, error } = await sb
      .from("quiz_scores")
      .select("created_at")
      .eq("matric_number", state.matric)
      .gte("created_at", startDate.toISOString());

    if (error) {
      console.error(
        "[STATS] Failed to load activity:",
        error
      );

      return null;
    }

    (data || []).forEach((attempt) => {
      const attemptDate = new Date(attempt.created_at).toDateString();

      const day = days.find(
        (d) => d.date === attemptDate
      );

      if (day) {
        day.count++;
      }
    });

    return days;

  } catch (err) {
    console.error(
      "[STATS] Activity chart error:",
      err
    );

    return null;
  }
}

/* ================= CURRENT QUIZ ACTIVITY ================= */

async function fetchCurrentQuizActivity() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn || !state.quizId) return null;

  try {
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);

      days.push({
        label: d.toLocaleDateString("en", {
          weekday: "short"
        }),
        date: d.toDateString(),
        count: 0
      });
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - 6);

    const { data, error } = await sb
      .from("quiz_scores")
      .select("created_at")
      .eq("matric_number", state.matric)
      .eq("quiz_id", state.quizId)
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    (data || []).forEach((attempt) => {
      const date = new Date(attempt.created_at).toDateString();

      const day = days.find(
        (item) => item.date === date
      );

      if (day) day.count++;
    });

    return days;

  } catch (err) {
    console.error(
      "[STATS] Current quiz activity error:",
      err
    );

    return null;
  }
}

async function fetchSupabaseTotalStars() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn) return null;

  try {
    const { data, error } = await sb
      .from("quiz_scores")
      .select("stars")
      .eq("matric_number", state.matric);

    if (error) {
      console.error(
        "[STATS] Failed to load total stars:",
        error
      );
      return null;
    }

    return (data || []).reduce(
      (total, attempt) => total + (attempt.stars || 0),
      0
    );

  } catch (err) {
    console.error(
      "[STATS] Total stars error:",
      err
    );

    return null;
  }
}

/* ================= CURRENT QUIZ TOTAL STARS ================= */

async function fetchCurrentQuizTotalStars() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn || !state.quizId) return null;

  try {
    const { data, error } = await sb
      .from("quiz_scores")
      .select("stars")
      .eq("matric_number", state.matric)
      .eq("quiz_id", state.quizId);

    if (error) throw error;

    return (data || []).reduce(
      (total, attempt) =>
        total + (attempt.stars || 0),
      0
    );

  } catch (err) {
    console.error(
      "[STATS] Current quiz stars error:",
      err
    );

    return null;
  }
}

/* ================= CURRENT QUIZ DAILY STATUS ================= */

async function isDailyChallengeCompletedToday() {
  const sb = getSupabase();

  if (!sb || !isStudentLoggedIn || !state.quizId) {
    return null;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await sb
      .from("quiz_scores")
      .select("id")
      .eq("matric_number", state.matric)
      .eq("quiz_id", state.quizId)
      .eq("difficulty_id", "daily")
      .eq("stage_id", "daily")
      .gte("created_at", today.toISOString())
      .limit(1);

    if (error) throw error;

    return (data || []).length > 0;

  } catch (err) {
    console.error(
      "[DAILY] Failed to check today's challenge:",
      err
    );

    return null;
  }
}

  /* ================= SUPABASE STAR POINTS ================= */

async function loadSupabaseStarPoints() {
  const sb = getSupabase();

  // Guests continue using localStorage only.
  if (!sb || !isStudentLoggedIn) return;

  try {
    const { data, error } = await sb
      .from("quiz_players")
      .select("star_points")
      .eq("matric_number", state.matric)
      .maybeSingle();

    if (error) throw error;

    if (!data) return;

    const xpData = getXPData();

    // Supabase is the source of truth for logged-in students.
    xpData.starPoints = data.star_points || 0;

    setXPData(xpData);

    updateStarPointsUI();

    console.log(
      `[STAR POINTS] Loaded ${xpData.starPoints} ✨ from Supabase`
    );

  } catch (err) {
    console.error("[STAR POINTS] Failed to load:", err);
  }
}

  async function fetchStudentRewards() {
    const sb = getSupabase();
    if (!sb || !isStudentLoggedIn) return [];
    try {
      const { data, error } = await sb.from("student_rewards").select("*").eq("matric_number", state.matric).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) { return []; }
  }

  window.quizClaimReward = async function (rewardId) {
    const sb = getSupabase();
    if (!sb || !isStudentLoggedIn) return;
    const btn = document.querySelector(`[data-reward-id="${rewardId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = "Claiming..."; }
    try {
      const { error } = await sb.from("student_rewards")
        .update({ status: "pending", claimed_at: new Date().toISOString() })
        .eq("id", rewardId).eq("matric_number", state.matric);
      if (error) throw error;
      const xpData = getXPData();
      xpData.claimedRewards = (xpData.claimedRewards || 0) + 1;
      setXPData(xpData);
      renderRewardsModal();
    } catch (err) {
      alert("Could not claim. Please try again.");
      if (btn) { btn.disabled = false; btn.textContent = "Claim Reward"; }
    }
  };

  /* ================= INIT ================= */
  async function init() {
    const root = document.getElementById("quiz-root");
    if (!quizId) { root.innerHTML = `<div class="quiz-error">No quiz specified. Add <code>?id=your-quiz-id</code> to the URL.</div>`; return; }
    state.quizId = quizId;
    try {
      const res = await fetch(QUIZ_DATA_PATH + quizId + ".json");
      if (!res.ok) throw new Error("Quiz not found: " + quizId);
      state.quiz = normalizeQuizData(await res.json());
    } catch (err) { root.innerHTML = `<div class="quiz-error">Couldn't load this quiz. ${err.message}</div>`; return; }

    if (studentData && studentData.fullname) {

  // Logged-in student
  state.player = studentData.fullname;
  state.matric =
    studentData.matric_number || matric;

} else {

  // Guest mode
  state.player = null;
  state.matric = null;

}

    // Hydrate the student's data cache from Supabase BEFORE anything
    // else reads/writes stars, best, records, or XP. Guests skip this
    // entirely and keep using localStorage as before.
    if (isStudentLoggedIn) {
      await loadStudentCache();
    }

const stars = getStars();

state.quiz.difficulties.forEach((d) => {
  d.stages.forEach((s) => {

    const key =
      `${d.id}:${s.id}`;

    if (!(key in stars)) {
      stars[key] = 0;
    }

  });
});

setStars(stars);

    // "Continue where you left off" — the hub links here with ?resume=1.
    // Jump straight into the first unlocked, not-yet-completed stage
    // instead of showing the welcome screen. Guests need their saved
    // name restored first since we're skipping the name-entry step.
    if (params.get("resume") === "1") {
      if (!isStudentLoggedIn && !state.player) {
        const savedName = localStorage.getItem(globalKey("player_name"));
        if (savedName) state.player = savedName;
      }
      if (state.player) {
        if (!state.avatar) state.avatar = AVATARS[(state.player.length + (state.matric?.length || 0)) % AVATARS.length];
        const target = findResumeTarget();
        if (target) {
          document.querySelectorAll(".quiz-avatar").forEach((el) => (el.textContent = state.avatar));
          document.querySelectorAll(".quiz-bar-name").forEach((el) => (el.textContent = state.player));
          startDifficulty(target.diffId);
          startStage(target.stageId);
          return;
        }
      }
      // No valid resume target (nothing played yet, or fully completed,
      // or a guest whose name we couldn't recover) — fall through to
      // the normal welcome screen below.
    }

renderWelcome();
showScreen("screen-welcome");
}

  // First unlocked stage without a recorded best score — the natural
  // "next up" spot, not necessarily the literal last-attempted stage.
  function findResumeTarget() {
    const best = getBest();
    const stars = getStars();
    for (const diff of state.quiz.difficulties) {
      for (let i = 0; i < diff.stages.length; i++) {
        const stage = diff.stages[i];
        const key = `${diff.id}:${stage.id}`;
        if (best[key]) continue; // already completed, keep looking
        const unlocked = i === 0 || (stars[`${diff.id}:${diff.stages[i - 1].id}`] || 0) > 0;
        return unlocked ? { diffId: diff.id, stageId: stage.id } : null;
      }
    }
    return null; // every stage in every difficulty already completed
  }

  /* ================= WELCOME ================= */
  function renderWelcome() {
    const q = state.quiz;
    document.getElementById("quiz-crest-emoji").textContent = q.icon || "📘";
    document.getElementById("quiz-title-arabic").textContent = q.titleArabic || "";
    document.getElementById("quiz-title-arabic").style.display = q.titleArabic ? "block" : "none";
    document.getElementById("quiz-title-text").textContent = q.title || "Quiz";
    document.getElementById("quiz-subtitle-text").textContent = q.subtitle || "";
    document.getElementById("quiz-desc-text").textContent = q.description || "";

    // "Continue where you left off" (hub settings menu) needs to know
    // which quiz a guest last opened. Students don't need this written
    // anywhere — the hub can just ask Supabase for their latest attempt.
    if (!isStudentLoggedIn) {
      try {
        localStorage.setItem("quiz_last_played", JSON.stringify({
          quizId: state.quizId, title: q.title || "Quiz", ts: Date.now()
        }));
      } catch (e) {}
    }

    const nameField = document.getElementById("quiz-name-field");
    const badge = document.getElementById("quiz-player-badge");
    const statsBtn = document.getElementById("quiz-stats-btn");
    const certBtn = document.getElementById("quiz-certificate-btn");

    if (state.player) {
      nameField.style.display = "none"; badge.style.display = "flex"; statsBtn.style.display = "inline-block";
      const avatar = state.avatar || AVATARS[(state.player.length + (state.matric?.length || 0)) % AVATARS.length];
      state.avatar = avatar;
      document.getElementById("quiz-welcome-avatar").textContent = avatar;
      document.getElementById("quiz-welcome-name").textContent = state.player;
      updateXPBar(document.getElementById("quiz-xp-bar-fill"), document.getElementById("quiz-welcome-level"), document.getElementById("quiz-welcome-xp"));
      updateStarPointsUI();
    } else {
      nameField.style.display = "block"; badge.style.display = "none"; statsBtn.style.display = "none";
    }

    // Certificate — real PDF for logged-in students once every stage of
    // the full course has an attempt on record (any score counts).
    // Guests who reach the same milestone see a register nudge instead
    // of nothing — it's their strongest motivation moment, just not a
    // verifiable name to put on an official document.
    if (certBtn) {
      const eligible = isCourseFullyCompleted();
      if (eligible && isStudentLoggedIn) {
        certBtn.style.display = "inline-block";
        certBtn.textContent = "🎓 Get Certificate";
      } else if (eligible && !isStudentLoggedIn) {
        certBtn.style.display = "inline-block";
        certBtn.textContent = "🎉 Register to Claim Certificate";
      } else {
        certBtn.style.display = "none";
      }
    }
  }

  /* ================= CERTIFICATE ================= */
  function isCourseFullyCompleted() {
    if (!state.quiz || !state.quiz.difficulties) return false;
    const best = getBest();
    return state.quiz.difficulties.every((diff) =>
      (diff.stages || []).every((stage) => !!best[`${diff.id}:${stage.id}`])
    );
  }

  function gatherCertificateData() {
    const best = getBest();
    let totalCorrect = 0, totalQuestions = 0;
    const breakdown = [];
    state.quiz.difficulties.forEach((diff) => {
      (diff.stages || []).forEach((stage) => {
        const key = `${diff.id}:${stage.id}`;
        const b = best[key] || { correct: 0, total: (stage.questions || []).length || 0 };
        totalCorrect += b.correct || 0;
        totalQuestions += b.total || 0;
        breakdown.push({
          label: `${diff.label} — ${stage.title}`,
          correct: b.correct || 0,
          total: b.total || 0,
          pct: b.total ? Math.round(((b.correct || 0) / b.total) * 100) : 0
        });
      });
    });
    const overallPct = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    return { breakdown, overallPct, totalCorrect, totalQuestions };
  }

  window.quizCertificateAction = function () {
    if (isStudentLoggedIn) { window.quizGenerateCertificate(); return; }
    window.location.href = "register.html";
  };

  // Loads an image (any same-origin path) and returns a PNG data URL
  // jsPDF can embed, plus its natural aspect ratio so the stamp isn't
  // stretched out of shape regardless of its actual pixel dimensions.
  function loadImageAsDataURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d").drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL("image/png"),
            ratio: img.naturalHeight / img.naturalWidth
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  window.quizGenerateCertificate = async function () {
    if (!isStudentLoggedIn) { alert("Log in as a registered student to get your certificate."); return; }
    if (!isCourseFullyCompleted()) { alert("Complete every stage of this course first to unlock your certificate."); return; }

    const jsPDFLib = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFLib) { alert("Certificate tool is still loading — please try again in a moment."); return; }

    const { breakdown, overallPct, totalCorrect, totalQuestions } = gatherCertificateData();
    const grade = getGrade(overallPct);
    const xpData = getXPData();
    const tutor = state.quiz.tutor || "Al-Bayan  Institute";

    // Signature stamp — adjust STAMP_URL if stamp.png lives somewhere
    // other than the same folder as this page. Missing/broken image
    // just skips the stamp silently, never blocks certificate generation.
    const STAMP_URL = "stamp.png";
    let stamp = null;
    try { stamp = await loadImageAsDataURL(STAMP_URL); }
    catch (e) { console.warn("[CERTIFICATE] Could not load stamp image:", STAMP_URL); }

    // Site's purple brand color — matches the navbar, not the sample's
    // blue. Adjust this one constant if it needs to match more exactly.
    const PURPLE = [45, 24, 74];
    const PURPLE_DARK = [26, 13, 46];
    const GOLD = [212, 175, 55];
    const GOLD_LIGHT = [232, 205, 120];
    const CREAM = [245, 240, 225];

    const doc = new jsPDFLib({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Background
    doc.setFillColor(...PURPLE_DARK);
    doc.rect(0, 0, W, H, "F");

    // Outer + inner borders
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(2.2);
    doc.rect(6, 6, W - 12, H - 12);
    doc.setLineWidth(0.6);
    doc.rect(10, 10, W - 20, H - 20);

    // Corner ornaments (simple diamond flourishes)
    const cornerSize = 5;
    [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]].forEach(([cx, cy]) => {
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.5);
      doc.line(cx - cornerSize, cy, cx + cornerSize, cy);
      doc.line(cx, cy - cornerSize, cx, cy + cornerSize);
    });

    let y = 26;

    doc.setFont("times", "italic");
    doc.setFontSize(15);
    doc.setTextColor(...GOLD);
    doc.text("Shahadat al-Taqdeer", W / 2, y, { align: "center" });

    y += 12;
    doc.setFont("times", "bold");
    doc.setFontSize(30);
    doc.setTextColor(255, 255, 255);
    doc.text("Certificate of Achievement", W / 2, y, { align: "center" });

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...GOLD_LIGHT);
    doc.text((state.quiz.title || "Quiz").toUpperCase() + " · COURSE COMPLETION", W / 2, y, { align: "center" });

    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...CREAM);
    doc.text("This certifies that", W / 2, y, { align: "center" });

    y += 12;
    doc.setFont("times", "bold");
    doc.setFontSize(26);
    doc.setTextColor(...GOLD);
    doc.text(state.player || "Student", W / 2, y, { align: "center" });
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(W / 2 - 45, y + 3, W / 2 + 45, y + 3);

    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11.5);
    doc.setTextColor(...CREAM);
    const bodyLine = `has completed all stages of the ${state.quiz.title || "quiz"} challenge` +
      (state.quiz.description ? `, covering ${state.quiz.description},` : ",") +
      ` with an overall score of`;
    const bodyLines = doc.splitTextToSize(bodyLine, W - 90);
    doc.text(bodyLines, W / 2, y, { align: "center" });
    y += bodyLines.length * 5.5 + 4;

    doc.setFont("times", "bold");
    doc.setFontSize(34);
    doc.setTextColor(...GOLD);
    doc.text(`${overallPct}%`, W / 2, y, { align: "center" });

    y += 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(`${grade.emoji}  ${grade.label}`, W / 2, y, { align: "center" });

    if (xpData.xp) {
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...GOLD_LIGHT);
      doc.text(`🏅 ${xpData.xp.toLocaleString()} XP earned on this account`, W / 2, y, { align: "center" });
    }

    y += 6;
    doc.setFont("times", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...CREAM);
    doc.text(grade.message, W / 2, y, { align: "center" });

    // Stage breakdown
    y += 12;
    const breakdownLeft = 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GOLD);
    doc.text("STAGE BREAKDOWN", breakdownLeft, y);
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.2);
    doc.line(breakdownLeft, y + 2, W - breakdownLeft, y + 2);

    y += 7;
    doc.setFontSize(9.5);
    const rowHeight = 5.6;
    const colSplit = W - breakdownLeft;
    breakdown.forEach((row) => {
      if (y > H - 32) return; // safety guard against overflow on very long courses
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...CREAM);
      doc.text(row.label, breakdownLeft, y);
      doc.setTextColor(...GOLD_LIGHT);
      doc.text(`${row.correct}/${row.total} · ${row.pct}%`, colSplit, y, { align: "right" });
      y += rowHeight;
    });

    // Footer — Guide/Tutor + Date
    const footerY = H - 20;
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.3);
    doc.line(breakdownLeft, footerY, breakdownLeft + 55, footerY);
    doc.line(W - breakdownLeft - 55, footerY, W - breakdownLeft, footerY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD_LIGHT);
    doc.text("Guide / Tutor", breakdownLeft, footerY + 5);
    doc.text("Date", W - breakdownLeft - 55, footerY + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(tutor, breakdownLeft, footerY - 2);
    doc.text(
      new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      W - breakdownLeft - 55, footerY - 2
    );

    // Signature stamp — placed just right of the tutor's signature
    // line, like a seal validating it, without overlapping any text.
    if (stamp) {
      const stampW = 18;
      const stampH = stampW * stamp.ratio;
      const stampX = breakdownLeft + 60;
      const stampY = footerY - stampH + 2;
      try { doc.addImage(stamp.dataUrl, "PNG", stampX, stampY, stampW, stampH); }
      catch (e) { console.warn("[CERTIFICATE] Could not embed stamp image:", e); }
    }

    const safeTitle = (state.quiz.title || "certificate").replace(/[^a-z0-9]+/gi, "-");
    doc.save(`${safeTitle}-certificate-${state.player || "student"}.pdf`);
  };

  function updateXPBar(barEl, levelEl, xpEl) {
    const xpData = getXPData();
    const lvl = getLevel(xpData.xp);
    if (barEl) barEl.style.width = `${(lvl.current / lvl.needed) * 100}%`;
    if (levelEl) levelEl.textContent = lvl.level;
    if (xpEl) xpEl.textContent = xpData.xp;
  }

  window.quizStartFromWelcome = function () {
    if (!state.player) {
      const nameInput = document.getElementById("quiz-name-input");
      state.player = (nameInput.value || "Guest").trim() || "Guest";
      localStorage.setItem(globalKey("player_name"), state.player);
      state.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    }
    if (!state.avatar) state.avatar = AVATARS[(state.player.length + (state.matric?.length || 0)) % AVATARS.length];
    document.querySelectorAll(".quiz-avatar").forEach((el) => (el.textContent = state.avatar));
    document.querySelectorAll(".quiz-bar-name").forEach((el) => (el.textContent = state.player));
    renderDifficultyList();
    showScreen("screen-difficulties");
  };

  /* ================= DIFFICULTIES ================= */
  function renderDifficultyList() {
    const stars = getStars();
    const list = document.getElementById("quiz-difficulty-list");
    list.innerHTML = "";
    let totalStars = 0, maxStars = 0;
    state.quiz.difficulties.forEach((d, idx) => {
      const diffStars = d.stages.reduce(
  (sum, s) => sum + (stars[`${d.id}:${s.id}`] || 0),
  0
);

const diffMax = d.stages.length * 3;

totalStars += diffStars;
maxStars += diffMax;

const prev = state.quiz.difficulties[idx - 1];

// A difficulty is unlocked only when ALL stages
// in the previous difficulty have been completed.
// Completion means the student has earned at least
// 1 star on every stage — perfection is NOT required.
const prevCompleted = prev
  ? prev.stages.every(
      (s) => (stars[`${prev.id}:${s.id}`] || 0) > 0
    )
  : false;

const unlocked = idx === 0 || prevCompleted;

const completed = diffStars === diffMax && diffMax > 0;
      const div = document.createElement("div");
      div.className = "quiz-diff-card" + (unlocked ? "" : " locked") + (completed ? " completed" : "");
      const starDisplay = `${diffStars}/${diffMax} ⭐`;
      div.innerHTML = `
        <div class="quiz-diff-icon">${d.icon || "📘"}</div>
        <div class="quiz-diff-info"><h3>${d.label}</h3><p>${unlocked ? (d.description || "") : "Complete the previous level to unlock 🔒"}</p></div>
        ${unlocked ? `<div class="quiz-diff-stars">${starDisplay}</div>` : `<div class="quiz-diff-lock">🔒 Locked</div>`}
        ${completed ? '<div class="quiz-diff-progress">✓ Complete</div>' : ""}`;
      if (unlocked) div.onclick = () => startDifficulty(d.id);
      list.appendChild(div);
    });
    document.getElementById("quiz-bar-total-stars").textContent = `${totalStars}/${maxStars}`;
    updateStarPointsUI();
  }

  window.quizGoToWelcome = function () { renderWelcome(); showScreen("screen-welcome"); };
  window.quizGoToDifficulties = function () { renderDifficultyList(); showScreen("screen-difficulties"); };

  function startDifficulty(diffId) {
    state.currentDifficulty = state.quiz.difficulties.find((d) => d.id === diffId);
    renderStageList(); showScreen("screen-stages");
  }

  /* ================= STAGES ================= */
  function renderStageList() {
    const d = state.currentDifficulty;
    const stars = getStars();
    document.getElementById("quiz-diff-icon").textContent = d.icon || "📘";
    document.getElementById("quiz-diff-title").textContent = d.label;
    document.getElementById("quiz-diff-desc").textContent = d.description || "";
    document.getElementById("quiz-bar-diff-stars").textContent = `${d.stages.reduce((sum, s) => sum + (stars[`${d.id}:${s.id}`] || 0), 0)}/${d.stages.length * 3}`;
    const list = document.getElementById("quiz-stage-list");
    list.innerHTML = "";
    d.stages.forEach((s, idx) => {
      const key = `${d.id}:${s.id}`;
      const unlocked = idx === 0 || (stars[`${d.id}:${d.stages[idx - 1].id}`] || 0) > 0;
      const div = document.createElement("div");
      div.className = "quiz-stage-card" + (unlocked ? "" : " locked");
      const st = stars[key] || 0;
      div.innerHTML = `
        <div class="quiz-stage-icon">${s.icon || "📗"}</div>
        <div class="quiz-stage-info"><h3>${s.title}</h3><p>${unlocked ? (s.description || "") : "Complete the previous stage to unlock 🔒"}</p></div>
        <div class="quiz-stage-stars">${unlocked ? "⭐".repeat(st) + "☆".repeat(3 - st) : "🔒"}</div>`;
      if (unlocked) div.onclick = () => startStage(s.id);
      list.appendChild(div);
    });
    const allDone = d.stages.every((s) => getBest()[`${d.id}:${s.id}`]);
    document.getElementById("quiz-final-report-btn").style.display = allDone ? "inline-block" : "none";
  }

  window.quizGoToStages = function () { renderStageList(); showScreen("screen-stages"); };
  window.quizExit = function () { if (confirm("Leave this quiz now? Your progress in this attempt won't be saved.")) quizGoToStages(); };

  /* ================= RUN STAGE ================= */
  function startStage(stageId) {
    const stage = state.currentDifficulty.stages.find((s) => s.id === stageId);
    state.currentStage = stage; state.qIndex = 0; state.score = 0; state.streak = 0;
    state.bestStreak = 0; state.xpGained = 0; state.newSimpleBadges = []; state.newTieredBadges = [];
    state.questions = shuffle(stage.questions); state.stageStartTime = Date.now();
    incrementRetryCount(`${state.quizId}:${state.currentDifficulty.id}:${stage.id}`);
    document.getElementById("quiz-stage-label").textContent = stage.title;
    showScreen("screen-quiz"); renderQuestion();
  }

  window.quizRetryStage = function () { startStage(state.currentStage.id); };

  function renderQuestion() {
    state.locked = false;
    const total = state.questions.length;
    const q = state.questions[state.qIndex];
    document.getElementById("quiz-progress-text").textContent = `Question ${state.qIndex + 1}/${total}`;
    document.getElementById("quiz-progress-fill").style.width = `${(state.qIndex / total) * 100}%`;
    document.getElementById("quiz-streak-count").textContent = state.streak;
    document.getElementById("quiz-q-kicker").textContent = q.kicker || state.currentStage.kicker || "";
    document.getElementById("quiz-q-text").innerHTML = q.text;
    document.getElementById("quiz-feedback").textContent = "";
    const optWrap = document.getElementById("quiz-options");
    optWrap.innerHTML = "";
    shuffle(q.options).forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "quiz-option-btn"; btn.innerHTML = opt;
      btn.onclick = () => selectAnswer(btn, opt, q.answer);
      optWrap.appendChild(btn);
    });
    document.getElementById("quiz-next-btn").disabled = true;
  }

  /* ================= SOUND & HAPTICS ================= */
  // Lightweight, asset-free feedback: synthesized tones (Web Audio API)
  // and device vibration (Vibration API). Both read the same localStorage
  // flags the settings menu writes — a device-level app preference, not
  // student data, so localStorage is the right place for it regardless
  // of guest/student status.
  function isSoundEnabled() { return localStorage.getItem("quiz_sound_enabled") !== "false"; }
  function isHapticsEnabled() { return localStorage.getItem("quiz_haptics_enabled") !== "false"; }

  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playTone(freq, startTime, duration, type = "sine", peakGain = 0.15) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
    gain.gain.linearRampToValueAtTime(peakGain, ctx.currentTime + startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration + 0.05);
  }

  function playCorrectSound() {
    if (!isSoundEnabled()) return;
    try { playTone(660, 0, 0.12); playTone(880, 0.1, 0.18); } catch (e) {}
  }
  function playWrongSound() {
    if (!isSoundEnabled()) return;
    try { playTone(220, 0, 0.22, "sawtooth", 0.1); } catch (e) {}
  }
  function playStageCompleteSound() {
    if (!isSoundEnabled()) return;
    try {
      [523, 659, 784, 1047].forEach((f, i) => playTone(f, i * 0.11, 0.22, "sine", 0.13));
    } catch (e) {}
  }
  function playVictorySound() {
    // A bigger, more triumphant fanfare for a perfect (3-star) stage —
    // an ascending run into a bright landing chord. Sawtooth layered
    // under the sine tones gives it a bit more brassy edge than a
    // plain sine chime (true trumpet/clap audio needs real sound
    // samples — synthesized oscillators can't fake those convincingly).
    if (!isSoundEnabled()) return;
    try {
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        playTone(f, i * 0.09, 0.18, "sine", 0.14);
        playTone(f, i * 0.09, 0.14, "sawtooth", 0.05);
      });
      [1047, 1319, 1568].forEach((f) => {
        playTone(f, 0.55, 0.55, "triangle", 0.12);
        playTone(f, 0.55, 0.4, "sawtooth", 0.05);
      });
    } catch (e) {}
  }
  function playFailSound() {
    // The classic "sad trombone" — a slow descending run. The
    // well-known game-over gag, easy to synthesize convincingly
    // (unlike a real trumpet/clap).
    if (!isSoundEnabled()) return;
    try {
      [349, 330, 311, 261].forEach((f, i) => playTone(f, i * 0.22, 0.35, "sawtooth", 0.09));
    } catch (e) {}
  }

  function triggerHaptic(pattern) {
    if (!isHapticsEnabled()) return;
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }
  function hapticCorrect() { triggerHaptic(30); }
  function hapticWrong() { triggerHaptic([40, 60, 40]); }
  function hapticStageComplete() { triggerHaptic([30, 40, 30, 40, 80]); }
  function hapticVictory() { triggerHaptic([30, 40, 30, 40, 30, 40, 130]); }
  function hapticFail() { triggerHaptic(220); }

  function playAnswerFeedback(isCorrect) {
    if (isCorrect) { playCorrectSound(); hapticCorrect(); }
    else { playWrongSound(); hapticWrong(); }
  }

  function selectAnswer(btn, chosen, answer) {
    if (state.locked) return;
    state.locked = true;
    const buttons = document.querySelectorAll(".quiz-option-btn");
    const isCorrect = chosen === answer;
    playAnswerFeedback(isCorrect);
    buttons.forEach((b) => { b.disabled = true; if (b.innerHTML === answer) b.classList.add("correct"); });
    const fb = document.getElementById("quiz-feedback");
    if (isCorrect) {
      btn.classList.add("correct"); state.score++; state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak);
      const praises = ["MashaAllah! 🌟", "Excellent! 🎉", "You got it! 💫", "Well done! ✨", "Perfect! 🌸"];
      fb.textContent = praises[Math.floor(Math.random() * praises.length)];
      const streakBonus = state.streak >= 5 ? 5 : state.streak >= 3 ? 2 : 0;
      const qXP = 10 + streakBonus; state.xpGained += qXP; showXPPopup(`+${qXP} XP`);
    } else {
      btn.classList.add("wrong"); state.streak = 0;
      fb.textContent = "Not quite — the correct answer is highlighted.";
    }
    document.getElementById("quiz-streak-count").textContent = state.streak;
    document.getElementById("quiz-next-btn").disabled = false;
  }

  function showXPPopup(text) {
    const el = document.getElementById("quiz-xp-popup");
    el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1000);
  }

  function showXPPopupIn(elId, text) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1000);
  }

  /* ================= ENDLESS MODE ================= */
  window.quizStartEndless = function () {
    const pool = shuffle(state.quiz.difficulties.flatMap((d) => d.stages.flatMap((s) => s.questions)));
    if (!pool.length) { alert("No questions available in this quiz yet."); return; }
    state.endless = {
      pool, idx: 0, score: 0, lives: 3, streak: 0, bestStreak: 0,
      xpGained: 0, startTime: Date.now(), questionsAnswered: 0,
    };
    showScreen("screen-endless");
    renderEndlessQuestion();
  };

  function renderEndlessHUD() {
  const e = state.endless;

  const lives = Math.max(
    0,
    Math.min(e.lives, STAR_SHOP_COSTS.maxLives)
  );

  document.getElementById("quiz-endless-hearts").textContent =
    "❤️".repeat(lives) +
    "🖤".repeat(STAR_SHOP_COSTS.maxLives - lives);

  document.getElementById("quiz-endless-score").textContent = e.score;
  document.getElementById("quiz-endless-streak").textContent = e.streak;

  // Keep the Star Shop buttons synchronized
  updateStarShopUI();
}

  function renderEndlessQuestion() {
    const e = state.endless;
    if (e.idx >= e.pool.length) { e.pool = shuffle(e.pool); e.idx = 0; }
    const q = e.pool[e.idx];
    state.locked = false;
    renderEndlessHUD();
    document.getElementById("quiz-endless-kicker").textContent = q.kicker || "";
    document.getElementById("quiz-endless-q-text").innerHTML = q.text;
    document.getElementById("quiz-endless-feedback").textContent = "";
    const optWrap = document.getElementById("quiz-endless-options");
    optWrap.innerHTML = "";
    shuffle(q.options).forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "quiz-option-btn"; btn.innerHTML = opt;
      btn.onclick = () => selectEndlessAnswer(btn, opt, q.answer);
      optWrap.appendChild(btn);
    });
    const nextBtn = document.getElementById("quiz-endless-next-btn");
    nextBtn.disabled = true;
    nextBtn.textContent = "Next ➜";
  }

  function selectEndlessAnswer(btn, chosen, answer) {
    if (state.locked) return;
    state.locked = true;
    const e = state.endless;
    const buttons = document.querySelectorAll("#quiz-endless-options .quiz-option-btn");
    const isCorrect = chosen === answer;
    playAnswerFeedback(isCorrect);
    buttons.forEach((b) => { b.disabled = true; if (b.innerHTML === answer) b.classList.add("correct"); });
    const fb = document.getElementById("quiz-endless-feedback");
    e.questionsAnswered++;

    if (isCorrect) {
      btn.classList.add("correct");
      e.streak++; e.bestStreak = Math.max(e.bestStreak, e.streak);
      const streakBonus = e.streak >= 5 ? 5 : e.streak >= 3 ? 2 : 0;
      e.score += 10 + streakBonus;
      const qXP = 5 + Math.floor(streakBonus / 2);
      e.xpGained += qXP;
      showXPPopupIn("quiz-endless-xp-popup", `+${qXP} XP`);
      const praises = ["MashaAllah! 🌟", "Excellent! 🎉", "On fire! 🔥", "Keep going! ✨"];
      fb.textContent = praises[Math.floor(Math.random() * praises.length)];
    } else {
      btn.classList.add("wrong");
      e.streak = 0;
      e.lives--;
      fb.textContent = e.lives > 0 ? "Not quite — the correct answer is highlighted." : "Out of hearts!";
    }

    renderEndlessHUD();

const nextBtn = document.getElementById("quiz-endless-next-btn");

if (e.lives <= 0) {
  // The Out of Lives modal handles the decision now.
  nextBtn.disabled = true;
  nextBtn.textContent = "Out of Lives";
} else {
  nextBtn.disabled = false;
  nextBtn.textContent = "Next ➜";
}
  }

  window.quizEndlessNext = function () {
  const e = state.endless;

  if (e.lives <= 0) {
    quizShowOutOfLives();
    return;
  }

  e.idx++;
  renderEndlessQuestion();
};

/* ================= OUT OF LIVES ================= */

window.quizShowOutOfLives = function () {
  const modal = document.getElementById("quiz-out-of-lives-modal");

  if (!modal) {
    console.warn("Out of Lives modal not found.");
    return;
  }

  const xpData = getXPData();
  const points = xpData.starPoints || 0;

  const pointsEl = document.getElementById("quiz-out-of-lives-points");

  if (pointsEl) {
    pointsEl.textContent = points;
  }

  const buyBtn = document.getElementById("quiz-out-of-lives-buy-btn");

  if (buyBtn) {
    if (points >= 5) {
      buyBtn.disabled = false;
      buyBtn.textContent = "🛒 Get 1 Life · ✨5";
    } else {
      buyBtn.disabled = true;
      buyBtn.textContent = "✨ Need 5 Star Points";
    }
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
};


window.quizEndOutOfLives = function () {
  const modal = document.getElementById("quiz-out-of-lives-modal");

  if (modal) {
    modal.classList.remove("active");
  }

  document.body.style.overflow = "";

  endEndlessRun();
};


window.quizBuyLifeFromOutOfLives = async function () {
  const e = state.endless;

  if (!e) return;

  const xpData = getXPData();
  const points = xpData.starPoints || 0;
  const cost = 5;

  if (points < cost) {
    quizShowOutOfLives();
    return;
  }

  if (e.lives > 0) {
    quizShowOutOfLives();
    return;
  }

  /* ================= SPEND 5 ✨ ================= */

  if (isStudentLoggedIn && getSupabase()) {
    try {
      const newBalance = await spendStarPoints(cost);

      // Supabase rejected the transaction.
      if (newBalance === null) {
        alert("Could not complete the purchase. Please try again.");
        return;
      }

      // Keep local data synchronized with Supabase.
      xpData.starPoints = newBalance;

    } catch (err) {
      console.error("[OUT OF LIVES] Purchase failed:", err);
      alert("Could not complete the purchase. Please try again.");
      return;
    }

  } else {
    /*
     * Guest:
     * Continue using localStorage only.
     */
    xpData.starPoints = points - cost;
  }

  /* ================= GIVE LIFE ================= */

  e.lives = 1;

  setXPData(xpData);

  updateStarPointsUI();
  renderEndlessHUD();

  /* ================= CLOSE MODAL ================= */

  const modal = document.getElementById("quiz-out-of-lives-modal");

  if (modal) {
    modal.classList.remove("active");
  }

  document.body.style.overflow = "";

  /* ================= CONTINUE QUESTION ================= */

  const nextBtn = document.getElementById("quiz-endless-next-btn");

  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.textContent = "Next ➜";
  }

  const feedback = document.getElementById("quiz-endless-feedback");

  if (feedback) {
    feedback.textContent = "❤️ Life restored! Keep going!";
  }
};

  window.quizExitEndless = function () {
    if (!confirm("End this run now? Your score so far will be saved.")) return;
    endEndlessRun();
  };

  async function endEndlessRun() {
    const e = state.endless;
    const duration = Math.round((Date.now() - e.startTime) / 1000);

    const prevHigh = getEndlessHigh();
    const isNewHigh = e.score > prevHigh;
    if (isNewHigh) setEndlessHigh(e.score);

    const xpData = getXPData();
    xpData.xp += e.xpGained;
    setXPData(xpData);

    addRecord({ quiz: state.quiz.title, difficulty: "Endless", stage: "Endless Run", score: e.score, total: e.questionsAnswered, stars: 0, xp: e.xpGained, duration });

    const { newSimple, newTiered } = checkBadges();
    state.newSimpleBadges = newSimple;
    state.newTieredBadges = newTiered;

    await syncScoreToSupabase({
      difficultyId: "endless", stageId: `endless-${Date.now()}`,
      score: e.score, total: e.questionsAnswered, stars: 0,
      xpGained: e.xpGained, bestStreak: e.bestStreak,
      newSimpleBadges: newSimple, newTieredBadges: newTiered,
    });

    document.getElementById("quiz-endless-result-trophy").textContent = isNewHigh ? "🏆" : "💥";
    document.getElementById("quiz-endless-result-sub").textContent =
      isNewHigh ? "New personal best!" : `Personal best: ${Math.max(prevHigh, e.score)}`;
    document.getElementById("quiz-endless-result-score").textContent =
      `Score: ${e.score} · ${e.questionsAnswered} questions answered · Best streak 🔥${e.bestStreak}`;
    document.getElementById("quiz-endless-xp-gain").textContent = `+${e.xpGained} XP earned!`;

    if (isNewHigh) launchConfetti();
    showScreen("screen-endless-result");
  }

  window.quizShareEndless = function () {
    const e = state.endless;
    const text = `🕌 *Al-Bayan Quiz — Endless Mode*\n\nI just scored *${e.score}* points in Endless Mode on *${state.quiz.title}*!\n\nCan you beat my score? Try it here:\n${window.location.origin}/quiz.html?id=${state.quizId}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    const xpData = getXPData();
    xpData.shareCount = (xpData.shareCount || 0) + 1;
    setXPData(xpData);
  };

  window.quizNextQuestion = async function () {
  state.qIndex++;

  if (state.qIndex >= state.questions.length) {
    await finishStage();
  } else {
    renderQuestion();
  }
};

  /* ================= BADGE CHECKING ================= */
  function gatherMetrics() {
    const stars = getStars();
    const records = getRecords();
    const xpData = getXPData();
    const stagesCompleted = Object.values(stars).filter((s) => s > 0).length;
    const perfectStages = Object.values(stars).filter((s) => s === 3).length;
    const difficultiesCompleted = state.quiz.difficulties.filter((d) => d.stages.every((s) => (stars[`${d.id}:${s.id}`] || 0) > 0)).length;
    const totalRetries = Object.values(xpData.attempts || {}).reduce((a, b) => a + b, 0);
    const durations = records.filter((r) => r.duration).map((r) => r.duration);
    const bestSpeed = durations.length ? Math.min(...durations) : 9999;
    const hour = new Date().getHours();
    const isWeekend = [0, 6].includes(new Date().getDay());
    const today = new Date().toDateString();

    if (!xpData.daysPlayed.includes(today)) {
      xpData.daysPlayed.push(today);
      if (xpData.daysPlayed.length > 100) xpData.daysPlayed.shift();
      setXPData(xpData);
    }
    if (hour >= 20 || hour < 5) {
      xpData.nightPlays = (xpData.nightPlays || 0) + 1;
      setXPData(xpData);
    }
    const stagesToday = records.filter((r) => new Date(r.date).toDateString() === today).length;
    if (stagesToday > xpData.maxStagesDay) {
      xpData.maxStagesDay = stagesToday;
      setXPData(xpData);
    }

    const lastPlay = xpData.lastPlayDate ? new Date(xpData.lastPlayDate) : null;
    const daysSinceLastPlay = lastPlay ? Math.floor((new Date() - lastPlay) / (1000 * 60 * 60 * 24)) : 0;
    xpData.lastPlayDate = new Date().toISOString();
    setXPData(xpData);

    return {
      bestStreak: state.bestStreak, dailyCount: xpData.dailyCount || 0,
      stagesCompleted, perfectStages, difficultiesCompleted, totalRetries,
      totalAttempts: records.length, bestSpeed, nightPlays: xpData.nightPlays || 0,
      shareCount: xpData.shareCount || 0, daysPlayed: xpData.daysPlayed.length,
      maxStagesDay: xpData.maxStagesDay, isWeekend, level: getLevel(xpData.xp).level,
      hasClaimedReward: xpData.claimedRewards > 0,
      daysSinceLastPlay,
    };
  }

  function checkBadges() {
    const xpData = getXPData();
    const metrics = gatherMetrics();
    const simpleEarned = new Set(xpData.simpleBadges || []);
    const currentTiers = xpData.badgeTiers || {};
    const newSimple = [];
    const newTiered = [];

    const checkSimple = (id, condition) => {
      if (!simpleEarned.has(id) && condition) {
        simpleEarned.add(id);
        newSimple.push(id);
      }
    };

    checkSimple("first_steps", metrics.totalAttempts >= 1);
    checkSimple("first_perfect", metrics.perfectStages >= 1);
    checkSimple("first_daily", metrics.dailyCount >= 1);
    checkSimple("first_share", metrics.shareCount >= 1);
    checkSimple("night_owl", metrics.nightPlays >= 1);
    checkSimple("early_bird", new Date().getHours() < 6);
    checkSimple("weekend_warrior", metrics.isWeekend);
    checkSimple("speed_runner", metrics.bestSpeed <= 60);
    checkSimple("marathoner", metrics.maxStagesDay >= 5);
    checkSimple("collector", metrics.difficultiesCompleted >= 1);
    checkSimple("loyal_student", metrics.daysPlayed >= 10);
    checkSimple("dedicated", metrics.daysPlayed >= 30);
    checkSimple("perfectionist", metrics.perfectStages >= 10);
    checkSimple("scholar", metrics.level >= 5);
    checkSimple("master", metrics.level >= 10);
    checkSimple("legend", metrics.level >= 20);
    checkSimple("explorer", state.quiz.difficulties.every((d) => d.stages.some((s) => (getStars()[`${d.id}:${s.id}`] || 0) > 0)));
    checkSimple("streak_5", metrics.bestStreak >= 5);
    checkSimple("streak_10", metrics.bestStreak >= 10);
    checkSimple("streak_25", metrics.bestStreak >= 25);
    checkSimple("retry_king", metrics.totalRetries >= 5);
    checkSimple("helper", metrics.shareCount >= 3);
    checkSimple("mastery_seeker", metrics.hasClaimedReward);
    checkSimple("comeback_kid", metrics.daysSinceLastPlay >= 7);

    TIERED_BADGES.forEach((def) => {
      const currentLevel = currentTiers[def.id] || 0;
      const value = metrics[def.metric];
      const eligible = def.tiers.filter((t) => {
        if (def.metric === "bestSpeed") return value <= t.threshold;
        return value >= t.threshold;
      });
      const highest = eligible.length ? Math.max(...eligible.map((t) => t.level)) : 0;
      if (highest > currentLevel) {
        for (let lvl = currentLevel + 1; lvl <= highest; lvl++) {
          const tierDef = def.tiers.find((t) => t.level === lvl);
          newTiered.push({ badgeId: def.id, badgeName: def.name, level: lvl, label: tierDef.label, tierDef });
        }
        currentTiers[def.id] = highest;
      }
    });

    xpData.simpleBadges = Array.from(simpleEarned);
    xpData.badgeTiers = currentTiers;
    setXPData(xpData);
    return { newSimple, newTiered };
  }

  /* ================= LEVEL MASTERY CHECK =================
     Fires after every finished stage. A difficulty only qualifies when:
       - the FINAL stage in it has been 3-starred, AND
       - every earlier stage in that same difficulty has 2+ stars.
     Awarded once ever per difficulty (tracked in xpData.levelMastery, keyed
     per-quiz so it can't collide with another quiz's difficulty of the same id). */
  function checkLevelMastery() {
    const xpData = getXPData();
    const starsMap = getStars();
    const awarded = xpData.levelMastery || {};
    const newMastery = [];

    state.quiz.difficulties.forEach((d, idx) => {
      if (!d.stages || !d.stages.length) return;
      const masteryKey = `${state.quizId}:${d.id}`;
      if (awarded[masteryKey]) return; // already earned, never re-award

      // Financial mastery is intentionally rare:
// every stage in this difficulty must have been completed with 3 stars.
const allStagesPerfect = d.stages.every(
  (s) => (starsMap[`${d.id}:${s.id}`] || 0) >= 3
);

if (!allStagesPerfect) return;

      const amount = getLevelMasteryAmount(idx);
      awarded[masteryKey] = true;
      newMastery.push({ diffId: d.id, diffLabel: d.label || d.id, amount });
    });

    xpData.levelMastery = awarded;
    setXPData(xpData);
    return newMastery;
  }

  /* ================= STAGE RESULT ================= */
  /* ================= BACKGROUND STAGE SYNC ================= */
  // Runs after the result screen is already shown to the student —
  // never blocks the UI. Handles both the score sync and the star
  // points wallet, then refreshes the header once settled.
  async function syncStageToBackend({ diff, stage, score, total, stars, totalXP, bestStreak, newSimple, newTiered, newMastery, starPointsEarned }) {
    if (isStudentLoggedIn && getSupabase()) {
      const syncSuccess = await syncScoreToSupabase({
        difficultyId: diff.id,
        stageId: stage.id,
        score, total, stars,
        xpGained: totalXP,
        bestStreak,
        newSimpleBadges: newSimple,
        newTieredBadges: newTiered,
        newMasteryRewards: newMastery
      });

      if (!syncSuccess) {
        console.warn("[SUPABASE] Normal quiz stage sync failed.");
      }

      if (starPointsEarned > 0) {
        const newBalance = await addStarPoints(starPointsEarned);
        if (newBalance === null) {
          console.warn("[STAR POINTS] Stage reward could not be persisted.");
        }
      }
    } else if (starPointsEarned > 0) {
      // Guest: localStorage wallet, instant.
      const xpData = getXPData();
      xpData.starPoints = (xpData.starPoints || 0) + starPointsEarned;
      setXPData(xpData);
    }

    updateStarPointsUI();
  }

  async function finishStage() {
  const stage = state.currentStage;
  const diff = state.currentDifficulty;
  const total = state.questions.length;
  const pctFrac = state.score / total;
  const pct100 = Math.round(pctFrac * 100);

  // ⭐ Stage stars
  // 100% = ⭐⭐⭐
  // 80–99% = ⭐⭐
  // 50–79% = ⭐
  // Below 50% = 0
  let stars = pctFrac >= 1 ? 3 : pctFrac >= 0.8 ? 2 : pctFrac >= 0.5 ? 1 : 0;

  const duration = Math.floor((Date.now() - state.stageStartTime) / 1000);

  const starBonus = stars === 3 ? 50 : stars === 2 ? 20 : 0;
  const timeBonus = Math.max(0, 10 - Math.floor(duration / 60));
  const totalXP = state.xpGained + starBonus + timeBonus;

  /* ================= BEST STAGE RESULT ================= */

  const starsMap = getStars();
  const stageKey = `${diff.id}:${stage.id}`;

  // Previous best star rating before this attempt
  const previousStars = starsMap[stageKey] || 0;

  // Keep only the student's highest star rating.
  starsMap[stageKey] = Math.max(previousStars, stars);
  setStars(starsMap);

/* ================= STAR POINTS ================= */

// Star Points are awarded ONLY when the student improves
// their best star rating for this stage.
//
// Every newly earned ⭐ gives 2 ✨.

const xpData = getXPData();

let starPointsEarned = 0;

if (stars > previousStars) {
  starPointsEarned = (stars - previousStars) * 2;
}

  /* ================= BEST SCORE ================= */

  const bestMap = getBest();
  const prevBest = bestMap[stageKey];

  if (!prevBest || pctFrac > prevBest.correct / prevBest.total) {
    bestMap[stageKey] = {
      correct: state.score,
      total
    };
    setBest(bestMap);
  }

  /* ================= XP / DAILY DATA ================= */

  xpData.xp += totalXP;

  if (state.dailyQuestion) {
    xpData.dailyCount = (xpData.dailyCount || 0) + 1;
    xpData.dailyDate = new Date().toDateString();
  }

  setXPData(xpData);

  /* ================= BADGES & MASTERY ================= */

  const { newSimple, newTiered } = checkBadges();
  const newMastery = checkLevelMastery();

  state.newSimpleBadges = newSimple;
  state.newTieredBadges = newTiered;

  /* ================= RECORD ================= */

  addRecord({
    quiz: state.quiz.title,
    difficulty: diff.label,
    stage: stage.title,
    score: state.score,
    total,
    stars,
    xp: totalXP,
    duration
  });
  
  /* ================= SUPABASE SYNC (background, non-blocking) =================
     Nothing the result screen displays depends on these responses — it's
     all computed locally above. So fire them off and let them finish in
     the background instead of making the student wait on two network
     round-trips before they even see their result. */
  syncStageToBackend({
    diff, stage, score: state.score, total, stars, totalXP,
    bestStreak: state.bestStreak, newSimple, newTiered, newMastery,
    starPointsEarned
  });

  /* ================= RESULT SCREEN ================= */
  if (stars >= 3) { playVictorySound(); hapticVictory(); }
  else if (stars === 0) { playFailSound(); hapticFail(); }
  else { playStageCompleteSound(); hapticStageComplete(); }

  const grade = getGrade(pct100);

  document.getElementById("quiz-progress-fill").style.width = "100%";

  document.getElementById("quiz-result-stars").textContent =
    "⭐".repeat(stars) + "☆".repeat(3 - stars);

  document.getElementById("quiz-result-score").textContent =
    `${state.player} scored ${state.score}/${total} (${pct100}/100) · Best streak 🔥${state.bestStreak}`;

  const badge = document.getElementById("quiz-result-grade-badge");

  badge.textContent = `${grade.emoji} ${grade.label}`;
  badge.className = "quiz-grade-badge " + grade.cls;

  const titles =
    stars === 3
      ? ["Perfect!", "Amazing work!", "You're a star!"]
      : stars === 2
        ? ["Great job!", "Well done!", "So close to perfect!"]
        : ["Good try!", "Keep practicing!", "You're getting there!"];

  document.getElementById("quiz-result-title").textContent =
    titles[Math.floor(Math.random() * titles.length)];

  document.getElementById("quiz-result-trophy").textContent =
    stars === 3 ? "🏆" : stars === 2 ? "🎉" : "💪";

      document.getElementById("quiz-result-sub").textContent =
    `${stage.title} complete`;

  const starPointMessage = starPointsEarned > 0
  ? `✨ +${starPointsEarned} Star Points · +${totalXP} XP earned!`
  : `No new ✨ Star Points · +${totalXP} XP earned!`;

document.getElementById("quiz-xp-gain").textContent = starPointMessage;

  const nbContainer = document.getElementById("quiz-new-badges");
  nbContainer.innerHTML = "";

  newSimple.forEach((id) => {
    const def = SIMPLE_BADGES.find((b) => b.id === id);
    if (!def) return;

    const span = document.createElement("span");
    span.className = "quiz-new-badge";
    span.style.borderColor = "#15803d";
    span.style.background = "#15803d22";
    span.textContent = `${def.icon} ${def.name}`;

    nbContainer.appendChild(span);
  });

  newTiered.forEach((t) => {
    const span = document.createElement("span");
    span.className = "quiz-new-badge";
    span.style.borderColor = TIER_COLORS[t.label];
    span.style.background = TIER_COLORS[t.label] + "22";
    span.textContent = `${t.label} ${t.badgeName}`;

    nbContainer.appendChild(span);
  });

  newMastery.forEach((m) => {
    const span = document.createElement("span");
    span.className = "quiz-new-badge";
    span.style.borderColor = TIER_COLORS.Mastery;
    span.style.background = TIER_COLORS.Mastery + "22";
    span.textContent =
      `👑 ${m.diffLabel} Mastery · ₦${m.amount.toLocaleString()} reward`;

    nbContainer.appendChild(span);
  });

  const banner = document.getElementById("quiz-final-banner");
  const continueBtn = document.getElementById("quiz-continue-btn");

  const diffDone = diff.stages.every(
    (s) => getBest()[`${diff.id}:${s.id}`]
  );

  if (
    diffDone &&
    state.quiz.difficulties.indexOf(diff) ===
      state.quiz.difficulties.length - 1
  ) {
    banner.textContent =
      `🌙 ${state.player} completed the full quiz — well done! 🌙`;

    continueBtn.textContent = "See Final Report ➜";
    continueBtn.onclick = renderFinalReport;
  } else {
    banner.textContent = "";
    continueBtn.textContent = "Continue ➜";
    continueBtn.onclick = window.quizGoToStages;
  }

  if (stars >= 2) launchConfetti();

  // ⭐ THIS is what actually takes the student
  // from the quiz screen to the success/result screen.
  showScreen("screen-result");
}

  /* ================= FINAL REPORT ================= */
  function renderFinalReport() {
    const diff = state.currentDifficulty;
    let overallCorrect = 0, overallTotal = 0;
    const breakdownEl = document.getElementById("quiz-final-breakdown");
    breakdownEl.innerHTML = "";
    diff.stages.forEach((s) => {
      const key = `${diff.id}:${s.id}`;
      const b = getBest()[key];
      const row = document.createElement("div"); row.className = "quiz-breakdown-row";
      if (b) { const p = Math.round((b.correct / b.total) * 100); overallCorrect += b.correct; overallTotal += b.total; row.innerHTML = `<span>${s.title}</span><span class="quiz-b-pct">${b.correct}/${b.total} · ${p}%</span>`; }
      else { row.innerHTML = `<span>${s.title}</span><span>Not attempted</span>`; }
      breakdownEl.appendChild(row);
    });
    const overallPct = overallTotal > 0 ? Math.round((overallCorrect / overallTotal) * 100) : 0;
    const grade = getGrade(overallPct);
    document.getElementById("quiz-final-score").innerHTML = `${overallPct}<span>/100</span>`;
    const badge = document.getElementById("quiz-final-grade-badge");
    badge.textContent = `${grade.emoji} ${grade.label}`; badge.className = "quiz-grade-badge " + grade.cls;
    document.getElementById("quiz-final-message").textContent = grade.message;
    document.getElementById("quiz-final-sub").textContent = `${state.player}'s overall performance — ${diff.label}`;
    document.getElementById("quiz-final-trophy").textContent = overallPct >= 90 ? "🏆" : overallPct >= 75 ? "🎓" : overallPct >= 50 ? "📖" : "💪";
    document.getElementById("quiz-final-report-banner").textContent = diff.stages.every((s) => getBest()[`${diff.id}:${s.id}`]) ? `🌙 Full difficulty complete, ${state.player}! 🌙` : "";
    if (overallPct >= 75) launchConfetti();
    showScreen("screen-final");
  }
  window.quizRenderFinalReport = renderFinalReport;

  /* ================= STATS ================= */
  window.quizShowStats = async function () {
  showScreen("screen-stats");

  const avatar = state.avatar || "🌸";

  document.getElementById("stats-avatar").textContent = avatar;
  document.getElementById("stats-name").textContent =
    state.player || "Guest";


  /* ================= CURRENT QUIZ STATS ================= */

  const currentQuizStats =
    await fetchCurrentQuizStats();

  if (currentQuizStats) {

    document.getElementById("stat-total-xp").textContent =
      currentQuizStats.totalXP;

    document.getElementById("stat-quizzes").textContent =
      currentQuizStats.quizzesDone;

    document.getElementById("stat-questions").textContent =
      currentQuizStats.totalQuestions;

    document.getElementById("stat-accuracy").textContent =
      currentQuizStats.accuracy + "%";

    document.getElementById("stat-best-streak").textContent =
      currentQuizStats.bestStreak;

  } else {

    /*
     * Guest fallback:
     * use only this quiz's local records.
     */

    const records = getRecords();

    const totalQ = records.reduce(
      (sum, record) =>
        sum + (record.total || 0),
      0
    );

    const totalC = records.reduce(
      (sum, record) =>
        sum + (record.score || 0),
      0
    );

    const accuracy =
      totalQ > 0
        ? Math.round(
            (totalC / totalQ) * 100
          )
        : 0;

    const totalXP = records.reduce(
  (sum, record) =>
    sum + (record.xp || 0),
  0
);

const bestStreak = records.reduce(
  (best, record) =>
    Math.max(
      best,
      record.bestStreak || 0
    ),
  0
);

document.getElementById("stat-total-xp").textContent =
  totalXP;

document.getElementById("stat-quizzes").textContent =
  records.length;

document.getElementById("stat-questions").textContent =
  totalQ;

document.getElementById("stat-accuracy").textContent =
  accuracy + "%";

document.getElementById("stat-best-streak").textContent =
  bestStreak;
  }


  /* ================= CURRENT QUIZ TOTAL STARS ================= */

  let totalStars = null;

  if (isStudentLoggedIn && getSupabase()) {
    totalStars =
      await fetchCurrentQuizTotalStars();
  }

  if (totalStars !== null) {

    document.getElementById("stat-total-stars").textContent =
      totalStars;

  } else {

    const stars = getStars();

    document.getElementById("stat-total-stars").textContent =
      Object.values(stars).reduce(
        (a, b) => a + b,
        0
      );
  }


  /* ================= GLOBAL PLAYER HEADER ================= */

  /*
   * Level / XP / Star Points in the player header
   * remain GLOBAL by design.
   */

  updateXPBar();
  updateStarPointsUI();


  /* ================= COURSE PROGRESS ================= */

  const courseProgress =
    getCurrentQuizProgress();

  const progressEl =
    document.getElementById(
      "quiz-course-progress"
    );

  if (progressEl && courseProgress) {

    progressEl.innerHTML = `
      <div class="quiz-course-progress-card">

        <div class="quiz-progress-header">
          <span>🪜 Course Progress</span>

          <strong>
            ${courseProgress.percentage}%
          </strong>
        </div>

        <div class="quiz-progress-track">
          <div
            class="quiz-progress-fill"
            style="width: ${courseProgress.percentage}%"
          ></div>
        </div>

        <div class="quiz-progress-meta">

          <span>
            ${courseProgress.completedStages} /
            ${courseProgress.totalStages}
            stages completed
          </span>

          <span>
            ⭐ ${courseProgress.earnedStars} /
            ${courseProgress.maxStars}
          </span>

        </div>

      </div>
    `;
  }


  /* ================= REWARDS ================= */

  const triggers =
    document.querySelectorAll(
      "#quiz-rewards-btn, .quiz-rewards-trigger, [data-action='show-rewards']"
    );

  triggers.forEach((el) => {

    el.style.display =
      isStudentLoggedIn ? "" : "none";

    el.style.cursor = "pointer";

    el.onclick = (e) => {
      e.preventDefault();
      quizShowRewards();
    };

  });


  /* ================= ACTIVITY & HISTORY ================= */

  renderActivityChart();
  renderHistory();
};

  async function renderActivityChart() {
  const chart = document.getElementById("quiz-chart");

  if (!chart) return;

  chart.innerHTML = "";

  let days = null;

  /* ================= SUPABASE ================= */

  if (isStudentLoggedIn && getSupabase()) {
    days = await fetchCurrentQuizActivity();
  }

  /* ================= LOCAL FALLBACK ================= */

  if (!days) {
    days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);

      days.push({
        label: d.toLocaleDateString("en", {
          weekday: "short"
        }),
        date: d.toDateString()
      });
    }

    const records = getRecords();

    days.forEach((day) => {
      day.count = records.filter(
        (r) =>
          new Date(r.date).toDateString() === day.date
      ).length;
    });
  }

  const counts = days.map((day) => day.count);

  const max = Math.max(...counts, 1);

  counts.forEach((count, index) => {
    const bar = document.createElement("div");

    bar.className = "quiz-chart-bar";

    bar.style.height =
      `${(count / max) * 100}%`;

    bar.setAttribute(
      "data-label",
      `${days[index].label}: ${count}`
    );

    chart.appendChild(bar);
  });
}

  async function renderHistory() {
  const list = document.getElementById("quiz-history-list");

  if (!list) return;

  list.innerHTML = "";

  let records = [];

  /* ================= SUPABASE ================= */

  if (isStudentLoggedIn && getSupabase()) {
    records = await fetchCurrentQuizAttempts(15);

    // If Supabase returns nothing, don't silently mix in
    // another student's/local history.
    if (!records.length) {
      list.innerHTML =
        '<p style="text-align:center;color:var(--text-muted);font-size:12px;">No attempts yet.</p>';
      return;
    }

    records.forEach((r) => {
      const row = document.createElement("div");
      row.className = "quiz-history-row";

      const d = new Date(r.created_at);

      const dateStr = d.toLocaleDateString("en", {
        month: "short",
        day: "numeric"
      });

      const difficulty =
        r.difficulty_id === "daily"
          ? "🌟 Daily Challenge"
          : r.difficulty_id || "Quiz";

      const stage =
        r.stage_id === "daily"
          ? ""
          : ` · Stage ${r.stage_id}`;

      row.innerHTML = `
        <span>
          ${difficulty}${stage}
        </span>

        <span>
          ${r.score}/${r.total_questions}
          · ${"⭐".repeat(r.stars || 0)}
          · +${r.xp_gained || 0} XP
          · ${dateStr}
        </span>
      `;

      list.appendChild(row);
    });

    return;
  }

  /* ================= GUEST / LOCAL ================= */

  records = getRecords().slice(0, 15);

  if (!records.length) {
    list.innerHTML =
      '<p style="text-align:center;color:var(--text-muted);font-size:12px;">No attempts yet.</p>';
    return;
  }

  records.forEach((r) => {
    const row = document.createElement("div");
    row.className = "quiz-history-row";

    const d = new Date(r.date);

    const dateStr = d.toLocaleDateString("en", {
      month: "short",
      day: "numeric"
    });

    row.innerHTML = `
      <span>${r.stage || r.difficulty || "Quiz"}</span>
      <span>${r.score}/${r.total} · ${dateStr}</span>
    `;

    list.appendChild(row);
  });
}

  /* ================= REWARDS MODAL ================= */
  window.quizShowRewards = async function () {
    const modal = document.getElementById("quiz-rewards-modal");
    if (!modal) {
      console.warn("Rewards modal not found in DOM. Make sure you have the modal HTML.");
      return;
    }
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
    await renderRewardsModal();
  };

  window.quizCloseRewards = function () {
    const modal = document.getElementById("quiz-rewards-modal");
    if (modal) {
      modal.classList.remove("active");
      document.body.style.overflow = "";
    }
  };

  /* ================= STAR SHOP ================= */

const STAR_SHOP_COSTS = {
  oneLife: 5,
  refill: 12,
  maxLives: 3
};


function updateStarShopUI() {
  const xpData = getXPData();
  const points = xpData.starPoints || 0;

  const e = state.endless;
  const lives = e ? Math.max(0, Math.min(e.lives, STAR_SHOP_COSTS.maxLives)) : 0;

  // Update Star Point balance
  const pointsEl = document.getElementById("quiz-shop-star-points");

  if (pointsEl) {
    pointsEl.textContent = points;
  }

  // +1 Life button
  const buyOneBtn = document.getElementById("quiz-buy-life-btn");

  if (buyOneBtn) {
    const canBuyOne =
      !!e &&
      lives < STAR_SHOP_COSTS.maxLives &&
      points >= STAR_SHOP_COSTS.oneLife;

    buyOneBtn.disabled = !canBuyOne;

    if (lives >= STAR_SHOP_COSTS.maxLives) {
      buyOneBtn.textContent = "Full";
    } else {
      buyOneBtn.textContent = "Buy";
    }
  }

  // Refill button
  const refillBtn = document.getElementById("quiz-buy-three-lives-btn");

  if (refillBtn) {
    const canRefill =
      !!e &&
      lives < STAR_SHOP_COSTS.maxLives &&
      points >= STAR_SHOP_COSTS.refill;

    refillBtn.disabled = !canRefill;

    if (lives >= STAR_SHOP_COSTS.maxLives) {
      refillBtn.textContent = "Full";
    } else {
      refillBtn.textContent = "Buy";
    }
  }
}


window.quizShowStarShop = function () {
  const modal = document.getElementById("quiz-star-shop-modal");

  if (!modal) {
    console.warn("Star Shop modal not found.");
    return;
  }

  updateStarPointsUI();
  updateStarShopUI();

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
};


window.quizCloseStarShop = function () {
  const modal = document.getElementById("quiz-star-shop-modal");

  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
};


/* ---------- BUY +1 LIFE ---------- */

window.quizBuyOneLife = async function () {
  const e = state.endless;

  if (!e) {
    alert("Start Endless Mode first.");
    return;
  }

  if (e.lives >= STAR_SHOP_COSTS.maxLives) {
    alert("You already have the maximum 3 lives. ❤️❤️❤️");
    return;
  }

  const xpData = getXPData();
  const points = xpData.starPoints || 0;
  const cost = STAR_SHOP_COSTS.oneLife;

  if (points < cost) {
    alert("You need 5 ✨ Star Points to buy a life.");
    return;
  }

  /*
   * Logged-in student:
   * Let Supabase perform the actual deduction.
   */
  if (isStudentLoggedIn && getSupabase()) {
    try {
      const newBalance = await spendStarPoints(cost);

      // Database rejected the purchase.
      if (newBalance === null) {
        alert("Could not complete the purchase. Please try again.");
        return;
      }

      // Database accepted the deduction.
      xpData.starPoints = newBalance;

    } catch (err) {
      console.error("[STAR SHOP] Purchase failed:", err);
      alert("Could not complete the purchase. Please try again.");
      return;
    }

  } else {
    /*
     * Guest:
     * Continue using localStorage only.
     */
    xpData.starPoints = points - cost;
  }

  // Add one life only after the Star Point deduction succeeds.
  e.lives = Math.min(
    STAR_SHOP_COSTS.maxLives,
    e.lives + 1
  );

  setXPData(xpData);

  // Refresh everything immediately.
  renderEndlessHUD();
  updateStarPointsUI();
  updateStarShopUI();
};


/* ---------- REFILL TO 3 LIVES ---------- */

window.quizBuyThreeLives = async function () {
  const e = state.endless;

  if (!e) {
    alert("Start Endless Mode first.");
    return;
  }

  if (e.lives >= STAR_SHOP_COSTS.maxLives) {
    alert("You already have the maximum 3 lives. ❤️❤️❤️");
    return;
  }

  const xpData = getXPData();
  const points = xpData.starPoints || 0;
  const cost = STAR_SHOP_COSTS.refill;

  if (points < cost) {
    alert("You need 12 ✨ Star Points to refill your lives.");
    return;
  }

  /*
   * Logged-in student:
   * Let Supabase perform the actual deduction.
   */
  if (isStudentLoggedIn && getSupabase()) {
    try {
      const newBalance = await spendStarPoints(cost);

      // Database rejected the purchase.
      if (newBalance === null) {
        alert("Could not complete the refill. Please try again.");
        return;
      }

      // Database accepted the deduction.
      xpData.starPoints = newBalance;

    } catch (err) {
      console.error("[STAR SHOP] Refill failed:", err);
      alert("Could not complete the refill. Please try again.");
      return;
    }

  } else {
    /*
     * Guest:
     * Continue using localStorage only.
     */
    xpData.starPoints = points - cost;
  }

  // Refill directly to maximum only after payment succeeds.
  e.lives = STAR_SHOP_COSTS.maxLives;

  setXPData(xpData);

  // Refresh everything immediately.
  renderEndlessHUD();
  updateStarPointsUI();
  updateStarShopUI();
};

/* ---------- STAR SHOP BUTTON CONNECTIONS ---------- */

document.addEventListener("DOMContentLoaded", function () {

  const buyOneBtn = document.getElementById("quiz-buy-life-btn");

  if (buyOneBtn) {
    buyOneBtn.onclick = window.quizBuyOneLife;
  }


  const refillBtn = document.getElementById("quiz-buy-three-lives-btn");

  if (refillBtn) {
    refillBtn.onclick = window.quizBuyThreeLives;
  }

});

  async function renderRewardsModal() {
    const container = document.getElementById("quiz-rewards-modal-body");
    const countEl = document.getElementById("quiz-rewards-count");
    if (!container) return;
    container.innerHTML = '<div class="quiz-rewards-loading">Loading your rewards...</div>';

    const rewards = await fetchStudentRewards();

    if (countEl) countEl.textContent = `${rewards.length} reward${rewards.length !== 1 ? "s" : ""}`;

    if (!rewards.length) {
      container.innerHTML = `
        <div class="quiz-rewards-empty">
          <div class="quiz-rewards-empty-icon">🎁</div>
          <h3>No Rewards Yet</h3>
          <p>Keep playing and unlocking tiered badges to earn discount rewards!</p>
        </div>`;
      return;
    }

    container.innerHTML = "";

    // Group by status
    const unclaimed = rewards.filter((r) => r.status === "unclaimed");
    const pending = rewards.filter((r) => r.status === "pending");
    const approved = rewards.filter((r) => r.status === "approved");
    const rejected = rewards.filter((r) => r.status === "rejected");

    const renderGroup = (title, items, icon) => {
      if (!items.length) return;
      const group = document.createElement("div");
      group.className = "quiz-rewards-group";
      group.innerHTML = `<div class="quiz-rewards-group-title">${icon} ${title} (${items.length})</div>`;
      const grid = document.createElement("div");
      grid.className = "quiz-rewards-grid";
      items.forEach((r) => {
        const isDiscount = r.reward_type === "discount";
        const valueText = isDiscount ? `₦${Number(r.reward_value).toLocaleString()} off` : r.reward_value;
        const tierColor = TIER_COLORS[r.tier] || "var(--text-muted)";
        const card = document.createElement("div");
        card.className = "quiz-reward-card";
        card.innerHTML = `
          <div class="quiz-reward-card-header" style="border-color:${tierColor}">
            <span class="quiz-reward-card-tier" style="background:${tierColor}22;color:${tierColor}">${r.tier}</span>
            <span class="quiz-reward-card-name">${r.badge_name}</span>
          </div>
          <div class="quiz-reward-card-body">
            <div class="quiz-reward-card-value">${isDiscount ? "💰" : "🏷️"} ${valueText}</div>
            <div class="quiz-reward-card-date">${new Date(r.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</div>
          </div>
          <div class="quiz-reward-card-footer">
            ${r.status === "unclaimed" && isDiscount
              ? `<button class="quiz-reward-claim-btn" data-reward-id="${r.id}" onclick="quizClaimReward('${r.id}')">Claim Reward</button>`
              : `<span class="quiz-reward-status-badge ${r.status}">${r.status === "pending" ? "⏳ Pending" : r.status === "approved" ? "✅ Approved" : "❌ Rejected"}</span>`
            }
          </div>
        `;
        grid.appendChild(card);
      });
      group.appendChild(grid);
      container.appendChild(group);
    };

    renderGroup("Unclaimed", unclaimed, "🎁");
    renderGroup("Pending Approval", pending, "⏳");
    renderGroup("Approved", approved, "✅");
    renderGroup("Rejected", rejected, "❌");
  }

  /* ================= LEADERBOARD ================= */
window.quizShowLeaderboard = async function () {

  showScreen("screen-leaderboard");

  const list =
    document.getElementById(
      "quiz-leaderboard-list"
    );

  const youRow =
    document.getElementById(
      "quiz-you-row"
    );

  const note =
    document.getElementById(
      "quiz-lb-note"
    );

  const titleEl =
    document.getElementById(
      "quiz-leaderboard-title"
    );

  const subtitleEl =
    document.getElementById(
      "quiz-leaderboard-subtitle"
    );


  /* ================= CURRENT QUIZ TITLE ================= */

  const quizTitle =
  state.quiz?.title ||
  "Quiz";


  if (titleEl) {
    titleEl.textContent =
      `🏆 ${quizTitle} Leaderboard`;
  }


  if (subtitleEl) {
    subtitleEl.textContent =
      "Top performers in this quiz";
  }


  list.innerHTML = "";

  youRow.style.display = "none";

  youRow.innerHTML = "";


  let entries = [];

  const sbEntries =
    await fetchSupabaseLeaderboard();


  if (
    sbEntries &&
    sbEntries.length
  ) {

    entries = sbEntries;

    note.textContent =
      "Live rankings from all students";

  } else {

    note.textContent =
      isStudentLoggedIn
        ? "Connecting to leaderboard... if this persists, check your internet."
        : "Log in to see the live leaderboard and compete with other students!";

    entries = [];
  }


  entries.forEach((entry) => {

    const row =
      document.createElement("div");

    row.className =
      "quiz-lb-row" +
      (
        entry.rank <= 3
          ? ` top-${entry.rank}`
          : ""
      ) +
      (
        entry.isYou
          ? " you"
          : ""
      );


    row.innerHTML = `
      <div class="quiz-lb-rank">
        ${entry.rank}
      </div>

      <div class="quiz-lb-avatar">
        ${entry.avatar}
      </div>

      <div class="quiz-lb-info">

        <div class="quiz-lb-name">
          ${escapeHtml(entry.name)}
          ${entry.isYou ? "(You)" : ""}
        </div>

        <div class="quiz-lb-meta">
          Level ${entry.level}
          · ${entry.quizzes} quizzes
        </div>

      </div>

      <div class="quiz-lb-score">
        ${entry.xp} XP
      </div>
    `;


    if (entry.isYou) {

      youRow.appendChild(
        row.cloneNode(true)
      );

      youRow.style.display =
        "block";

    } else {

      list.appendChild(row);

    }

  });


  if (entries.length === 0) {

    list.innerHTML =
      '<p style="text-align:center;color:var(--text-muted);padding:20px;">No scores yet. Be the first!</p>';

  }

};

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /* ================= BADGES SCREEN ================= */
  window.quizShowBadges = function () {
    showScreen("screen-badges");
    const xpData = getXPData();
    const simpleEarned = new Set(xpData.simpleBadges || []);
    const tiers = xpData.badgeTiers || {};

    const simpleUnlocked = simpleEarned.size;
    const tieredUnlocked = Object.values(tiers).reduce((a, b) => a + b, 0);
    const totalSimple = SIMPLE_BADGES.length;
    const totalTieredPhases = TIERED_BADGES.reduce((sum, b) => sum + b.tiers.length, 0);

    document.getElementById("badge-count").textContent = simpleUnlocked + tieredUnlocked;
    document.getElementById("badge-total").textContent = totalSimple + totalTieredPhases;

    const grid = document.getElementById("quiz-badge-grid");
    grid.innerHTML = "";

    const simpleHeader = document.createElement("div");
    simpleHeader.style.cssText = "grid-column:1/-1;font-weight:800;font-size:14px;color:var(--text-color);margin-top:8px;margin-bottom:4px;";
    simpleHeader.textContent = `🏅 Achievements (${simpleUnlocked}/${totalSimple})`;
    grid.appendChild(simpleHeader);

    SIMPLE_BADGES.forEach((def) => {
      const unlocked = simpleEarned.has(def.id);
      const div = document.createElement("div");
      div.className = "quiz-badge-item" + (unlocked ? " unlocked" : "");
      div.innerHTML = `<span class="quiz-badge-icon">${unlocked ? def.icon : "🔒"}</span><div class="quiz-badge-name">${def.name}</div><div class="quiz-badge-desc">${def.desc}</div>`;
      grid.appendChild(div);
    });

    const tieredHeader = document.createElement("div");
    tieredHeader.style.cssText = "grid-column:1/-1;font-weight:800;font-size:14px;color:var(--text-color);margin-top:16px;margin-bottom:4px;";
    tieredHeader.textContent = `🏆 Progression Paths (${tieredUnlocked}/${totalTieredPhases} tiers)`;
    grid.appendChild(tieredHeader);

    TIERED_BADGES.forEach((def) => {
      const currentLevel = tiers[def.id] || 0;
      const div = document.createElement("div");
      div.className = "quiz-badge-item" + (currentLevel > 0 ? " unlocked" : "");

      let tierText = "Locked";
      let tierColor = "var(--text-muted)";
      let progressText = "";
      if (currentLevel > 0) {
        const tierDef = def.tiers.find((t) => t.level === currentLevel);
        tierText = tierDef.label;
        tierColor = TIER_COLORS[tierDef.label];
        const nextTier = def.tiers.find((t) => t.level === currentLevel + 1);
        if (nextTier) {
          const metrics = gatherMetrics();
          const currentVal = metrics[def.metric];
          const need = nextTier.threshold;
          const pct = def.metric === "bestSpeed"
            ? Math.min(100, Math.round((need / Math.max(currentVal, 1)) * 100))
            : Math.min(100, Math.round((currentVal / need) * 100));
          progressText = `Next: ${pct}%`;
        } else {
          progressText = "MAXED! 💎";
        }
      }

      div.innerHTML = `
        <span class="quiz-badge-icon">${currentLevel > 0 ? def.icon : "🔒"}</span>
        <div class="quiz-badge-name">${def.name}</div>
        <div class="quiz-badge-desc">${def.desc}</div>
        <div class="quiz-badge-tier" style="color:${tierColor};font-weight:700;font-size:11px;margin-top:4px;">${tierText}</div>
        ${currentLevel > 0 ? `<div class="quiz-badge-progress" style="font-size:10px;color:var(--text-muted);margin-top:2px;">Tier ${currentLevel}/${def.tiers.length} · ${progressText}</div>` : `<div class="quiz-badge-progress" style="font-size:10px;color:var(--text-muted);margin-top:2px;">${def.tiers[0].threshold} to Bronze</div>`}
      `;
      grid.appendChild(div);
    });
  };

  /* ================= DAILY CHALLENGE ================= */
  window.quizShowDaily = async function () {
    showScreen("screen-daily");
    document.querySelectorAll(".quiz-bar-name").forEach((el) => (el.textContent = state.player || "Guest"));
    document.querySelectorAll(".quiz-avatar").forEach((el) => (el.textContent = state.avatar || "🌸"));

    const today = new Date().toDateString();

let isDone = false;

if (isStudentLoggedIn && getSupabase()) {
  const supabaseDone =
    await isDailyChallengeCompletedToday();

  if (supabaseDone !== null) {
    isDone = supabaseDone;
  }
} else {
  // Guest fallback — keep Daily Challenge separate per quiz.
  const localDailyDate =
    localStorage.getItem(
      storageKey("dailyDate")
    );

  isDone = localDailyDate === today;
}

    const qCard = document.getElementById("quiz-daily-question-card");
    const doneCard = document.getElementById("quiz-daily-done");
    const startBtn = document.getElementById("quiz-daily-start-btn");

    if (isDone) {
      qCard.style.display = "none"; startBtn.style.display = "none"; doneCard.style.display = "block";
      document.getElementById("daily-xp-gain").textContent = "Come back tomorrow for +20 XP!";
    } else {
      qCard.style.display = "none"; doneCard.style.display = "none"; startBtn.style.display = "inline-block";
      startBtn.disabled = false; startBtn.textContent = "Start Challenge ➜";
    }
  };

  window.quizStartDaily = function () {
    const allQuestions = [];
    state.quiz.difficulties.forEach((d) => {
      d.stages.forEach((s) => {
        s.questions.forEach((q) => {
          allQuestions.push({ ...q, stageTitle: s.title, diffId: d.id });
        });
      });
    });
    if (!allQuestions.length) return;
    const q = allQuestions[Math.floor(Math.random() * allQuestions.length)];
    state.dailyQuestion = q; state.dailyLocked = false;

    document.getElementById("quiz-daily-start-btn").style.display = "none";
    document.getElementById("quiz-daily-question-card").style.display = "block";
    document.getElementById("daily-q-kicker").textContent = "Daily Challenge · " + q.stageTitle;
    document.getElementById("daily-q-text").innerHTML = q.text;
    document.getElementById("daily-feedback").textContent = "";

    const optWrap = document.getElementById("daily-options");
    optWrap.innerHTML = "";
    shuffle(q.options).forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "quiz-option-btn"; btn.innerHTML = opt;
      btn.onclick = () => selectDailyAnswer(btn, opt, q.answer);
      optWrap.appendChild(btn);
    });
  };

  async function selectDailyAnswer(btn, chosen, answer) {
  if (state.dailyLocked) return;
  state.dailyLocked = true;

  const buttons = document.querySelectorAll("#daily-options .quiz-option-btn");
  const isCorrect = chosen === answer;
  playAnswerFeedback(isCorrect);

  buttons.forEach((b) => {
    b.disabled = true;
    if (b.innerHTML === answer) b.classList.add("correct");
  });

  const fb = document.getElementById("daily-feedback");
  const xpPopup = document.getElementById("daily-xp-popup");

  if (isCorrect) {
    btn.classList.add("correct");
    fb.textContent = "Correct! 🌟";

    const xp = 20;

    /* ================= DAILY STAR REWARD ================= */

    // A correct Daily Challenge earns 1 ⭐.
    // Every ⭐ is worth 2 ✨ Star Points.

    const dailyStars = 1;
    const starPointsEarned = dailyStars * 2;

    /* ================= DAILY STAR RECORD ================= */

const starsMap = getStars();
const dailyStarKey = "daily";

starsMap[dailyStarKey] = Math.max(
  starsMap[dailyStarKey] || 0,
  dailyStars
);

setStars(starsMap);

const xpData = getXPData();

xpData.xp += xp;

xpData.dailyCount = (xpData.dailyCount || 0) + 1;
xpData.dailyDate = new Date().toDateString();

setXPData(xpData);

    /* ================= BADGES ================= */

    const { newSimple, newTiered } = checkBadges();

    /* ================= SUPABASE ================= */

if (isStudentLoggedIn && getSupabase()) {

  // First synchronize the Daily Challenge XP/badges.
  // Daily Challenge does NOT count as a normal quiz stage.
  const syncSuccess = await syncScoreToSupabase(
    {
      difficultyId: "daily",
      stageId: "daily",
      score: 1,
      total: 1,
      stars: dailyStars,
      xpGained: xp,
      bestStreak: 1,
      newSimpleBadges: newSimple,
      newTieredBadges: [],
      newMasteryRewards: [],
    },
    {
  countAsQuiz: false,
  isDaily: true
}
  );

  if (!syncSuccess) {
    console.warn(
      "[SUPABASE] Daily Challenge sync failed."
    );
  }

}

/* ================= PERSIST DAILY STAR POINTS ================= */

if (starPointsEarned > 0) {

  if (isStudentLoggedIn && getSupabase()) {

    // Supabase is the source of truth for logged-in students.
    const newBalance =
      await addStarPoints(starPointsEarned);

    if (newBalance === null) {
      console.warn(
        "[STAR POINTS] Daily Challenge reward could not be persisted."
      );
    }

  } else {

    // Guests use localStorage.
    xpData.starPoints =
      (xpData.starPoints || 0) + starPointsEarned;

    setXPData(xpData);
  }
}

updateStarPointsUI();

    /* ================= UI ================= */

    xpPopup.textContent = `+${xp} XP · ✨ +${starPointsEarned}`;
    xpPopup.classList.add("show");

    setTimeout(() => {
      xpPopup.classList.remove("show");
    }, 1000);

    // Update the global Star Points display
    updateStarPointsUI();

    launchConfetti();

  } else {

    btn.classList.add("wrong");
    fb.textContent = "Not quite — better luck tomorrow!";

    const xpData = getXPData();

    // The Daily Challenge is consumed even if answered incorrectly.
    xpData.dailyDate = new Date().toDateString();

    setXPData(xpData);
  }

  setTimeout(() => {

    document.getElementById("quiz-daily-question-card").style.display = "none";
    document.getElementById("quiz-daily-done").style.display = "block";

    document.getElementById("daily-xp-gain").textContent =
      isCorrect
        ? "+20 XP · ⭐ +1 · ✨ +2"
        : "Come back tomorrow!";

  }, 1500);
}

  /* ================= SHARE ================= */
  window.quizShareResult = function () {
    const stage = state.currentStage;
    const diff = state.currentDifficulty;
    const text = `🕌 *Al-Bayan Quiz*\n\nI just scored *${state.score}/${state.questions.length}* on *${stage.title}* (${diff.label})!\n\nCan you beat my score? Try it here:\n${window.location.origin}/quiz.html?id=${state.quizId}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");

    const xpData = getXPData();
    xpData.shareCount = (xpData.shareCount || 0) + 1;
    setXPData(xpData);
  };

  window.quizShareFinal = function () {
    const diff = state.currentDifficulty;
    const bestMap = getBest();
    let totalCorrect = 0, totalQ = 0;
    diff.stages.forEach((s) => {
      const b = bestMap[`${diff.id}:${s.id}`];
      if (b) { totalCorrect += b.correct; totalQ += b.total; }
    });
    const pct = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
    const text = `🕌 *Al-Bayan Quiz*\n\nI completed *${diff.label}* with *${pct}%* overall!\n\n🏆 Total XP: ${getXPData().xp}\n⭐ Level: ${getLevel(getXPData().xp).level}\n\nTry it here:\n${window.location.origin}/quiz.html?id=${state.quizId}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");

    const xpData = getXPData();
    xpData.shareCount = (xpData.shareCount || 0) + 1;
    setXPData(xpData);
  };

  /* ================= CONFETTI ================= */
  function launchConfetti() {
    const colors = ["#b8a502", "#2e064e", "#c9a8e8", "#f0eaf8", "#15803d", "#FFD700"];
    for (let i = 0; i < 50; i++) {
      const el = document.createElement("div");
      el.className = "quiz-confetti";
      el.style.left = Math.random() * 100 + "vw";
      el.style.width = 6 + Math.random() * 8 + "px";
      el.style.height = 6 + Math.random() * 8 + "px";
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = 2.5 + Math.random() * 2 + "s";
      el.style.animationDelay = Math.random() * 0.5 + "s";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 5000);
    }
  }

  /* ================= BOOT ================= */
  document.addEventListener("DOMContentLoaded", init);
})();
