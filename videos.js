console.log("Videos JS loaded");


// ===== Supabase client =====
const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
const SUPABASE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// ===== DOM refs =====
const loadingEl    = document.getElementById("videosLoading");
const emptyEl      = document.getElementById("videosEmpty");
const drillEl      = document.getElementById("drillContainer");
const breadcrumbEl = document.getElementById("drillBreadcrumb");
const videoModal   = document.getElementById("videoModal");
const youtubeFrame = document.getElementById("youtubeFrame");



// ===== State =====
let payments     = [];   // student's paid months
let drillLevel   = 0;    // 0 = courses, 1 = books, 2 = videos
let activeCourse = null; // { id, name }
let activeBook   = null; // { id, title }


// ===== Auth guard =====
// Supports both localStorage (7-day) and sessionStorage (legacy)
const matric = localStorage.getItem("matric") || sessionStorage.getItem("matric");
if (!matric) {
  alert("Please login first.");
  window.location.href = "login.html";
}


// ===== Month helper =====
function monthToNumber(month) {
  if (!month) return 0;
  const map = {
    january:1, february:2, march:3, april:4,
    may:5, june:6, july:7, august:8,
    september:9, october:10, november:11, december:12
  };
  return map[month.toLowerCase()] || 0;
}


// ===== UI state helpers =====
function showLoading(show) {
  loadingEl.style.display  = show ? "flex" : "none";
  drillEl.style.display    = show ? "none" : drillEl.style.display;
  emptyEl.style.display    = "none";
}

function showDrill() {
  loadingEl.style.display = "none";
  emptyEl.style.display   = "none";
  drillEl.style.display   = "block";
}

function showEmpty() {
  loadingEl.style.display = "none";
  drillEl.style.display   = "none";
  emptyEl.style.display   = "flex";
}


// ===== Breadcrumb =====
function renderBreadcrumb() {
  if (drillLevel === 0) {
    breadcrumbEl.style.display = "none";
    return;
  }

  breadcrumbEl.style.display = "flex";

  let html = `<span class="crumb" data-level="0">${t("Videos")}</span>`;

  if (drillLevel >= 1 && activeCourse) {
    html += `<i class="fa-solid fa-chevron-right sep" aria-hidden="true"></i>`;
    if (drillLevel === 1) {
      html += `<span class="crumb current">${activeCourse.course_name}</span>`;
    } else {
      html += `<span class="crumb" data-level="1">${activeCourse.course_name}</span>`;
    }
  }

  if (drillLevel === 2 && activeBook) {
    html += `<i class="fa-solid fa-chevron-right sep" aria-hidden="true"></i>`;
    html += `<span class="crumb current">${activeBook.title}</span>`;
  }

  breadcrumbEl.innerHTML = html;

  // Wire up clickable crumbs
  breadcrumbEl.querySelectorAll(".crumb[data-level]").forEach(el => {
    el.addEventListener("click", () => {
      const level = parseInt(el.dataset.level);
      if (level === 0) loadCourses();
      if (level === 1) loadBooks(activeCourse);
    });
  });
}


// ===== Render: folder grid (courses + books) =====
function renderFolderGrid(items) {
  // items: [{ icon, title, subtitle, onClick }]
  drillEl.innerHTML = `<div class="folder-grid">${
    items.map((it, i) => `
      <div class="folder-card" data-idx="${i}" tabindex="0" role="button" aria-label="${it.title}">
        <div class="folder-card-icon">
          <i class="${it.icon}" aria-hidden="true"></i>
        </div>
        <div>
          <h3>${it.title}</h3>
          <p>${it.subtitle}</p>
        </div>
        <i class="fa-solid fa-chevron-right folder-arrow" aria-hidden="true"></i>
      </div>
    `).join("")
  }</div>`;

  drillEl.querySelectorAll(".folder-card").forEach((el, i) => {
    el.addEventListener("click", items[i].onClick);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        items[i].onClick();
      }
    });
  });

  showDrill();
  window.reTranslate?.();
}


// ===== Render: video cards (level 2) =====
function renderVideoGrid(videos) {
  drillEl.innerHTML = `<div class="videos-grid">${
    videos.map(video => {
      const videoMonthNum = monthToNumber(video.month);
      const isUnlocked    = payments.some(p => monthToNumber(p.month) >= videoMonthNum);
      const thumbUrl      = `https://img.youtube.com/vi/${video.youtube_link}/hqdefault.jpg`;

      // Language badge
      let langHtml = "";
      if (video.language === "english") {
        langHtml = `<span class="lang-badge english">${t("English")}</span>`;
      } else if (video.language === "arabic") {
        langHtml = `<span class="lang-badge arabic">${t("Arabic")}</span>`;
      }

      return `
        <div class="video-card${isUnlocked ? "" : " locked"}"
             style="background-image:url('${thumbUrl}');"
             data-ytid="${video.youtube_link}"
             data-unlocked="${isUnlocked}"
             tabindex="0" role="button" aria-label="${video.title}">
          <div class="play-btn">
            <i class="fa-solid fa-play" aria-hidden="true"></i>
          </div>
          ${langHtml}
          <h3>${video.title}</h3>
          ${!isUnlocked ? `
            <div class="lock-overlay">
              <i class="fa-solid fa-lock" aria-hidden="true"></i>
              <span>${t("Complete payment to unlock")}</span>
            </div>` : ""}
        </div>
      `;
    }).join("")
  }</div>`;

  drillEl.querySelectorAll(".video-card").forEach(card => {
    card.addEventListener("click", () => openModal(card));
    card.addEventListener("keydown", e => {
      if (e.key === "Enter") openModal(card);
    });
  });

  showDrill();
  window.reTranslate?.();
}


// ===== Modal =====
function openModal(card) {
  const unlocked = card.dataset.unlocked === "true";

  if (!unlocked) {
    alert(t("Complete your payment to unlock this video."));
    return;
  }

  youtubeFrame.src  = `https://www.youtube.com/embed/${card.dataset.ytid}?autoplay=1`;
  videoModal.classList.add("open");
}


// ===== Data loaders =====

async function loadCourses() {
  drillLevel   = 0;
  activeCourse = null;
  activeBook   = null;
  renderBreadcrumb();
  showLoading(true);

  const { data: courses, error } = await sb
    .from("courses")
    .select("id, course_name")
    .eq("deleted", false)
    .order("created_at", { ascending: true });

  showLoading(false);

  if (error) {
    console.error("Courses error:", error);
    showEmpty();
    return;
  }

  if (!courses || courses.length === 0) {
    showEmpty();
    return;
  }

  console.log("Courses loaded:", courses);

  renderFolderGrid(courses.map(c => ({
    icon: "fa-solid fa-book-open",
    title: c.course_name,
    subtitle: t("Tap to browse books"),
    onClick: () => loadBooks(c)
  })));
}


async function loadBooks(course) {
  drillLevel   = 1;
  activeCourse = course;
  activeBook   = null;
  renderBreadcrumb();
  showLoading(true);

  const { data: books, error } = await sb
    .from("books")
    .select("id, title, order_index")
    .eq("course_id", course.id)
    .eq("deleted", false)
    .order("order_index", { ascending: true });

  showLoading(false);

  if (error) {
    console.error("Books error:", error);
    showEmpty();
    return;
  }

  if (!books || books.length === 0) {
    showEmpty();
    return;
  }

  console.log("Books loaded:", books);

  renderFolderGrid(books.map(b => ({
    icon: "fa-solid fa-folder",
    title: b.title,
    subtitle: t("Tap to see videos"),
    onClick: () => loadVideos(b)
  })));
}


async function loadVideos(book) {
  drillLevel = 2;
  activeBook = book;
  renderBreadcrumb();
  showLoading(true);

  const { data: videos, error } = await sb
    .from("videos")
    .select("*")
    .eq("book_id", book.id)
    .order("language", { ascending: true }); // english before arabic alphabetically

  showLoading(false);

  if (error) {
    console.error("Videos error:", error);
    showEmpty();
    return;
  }

  if (!videos || videos.length === 0) {
    showEmpty();
    return;
  }

  console.log("Videos loaded:", videos);

  renderVideoGrid(videos);
}


// ===== Init =====
async function init() {
  showLoading(true);

  // Fetch student's paid months once — reused for all unlock checks
  const { data: pays, error: payErr } = await sb
    .from("payments")
    .select("month")
    .eq("matric_number", matric)
    .eq("status", "paid")
    .eq("deleted", false);

  if (payErr) {
    console.error("Payments error:", payErr);
    showLoading(false);
    showEmpty();
    return;
  }

  payments = pays || [];
  console.log("Payments loaded:", payments.length);

  // Start at courses level
  await loadCourses();
}

document.addEventListener("DOMContentLoaded", init);
