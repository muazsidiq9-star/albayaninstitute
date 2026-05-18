console.log("Videos JS loaded");

// ===== Supabase client =====
const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== DOM elements =====
const videosGrid = document.querySelector(".videos-grid");
const videoModal = document.getElementById("videoModal");
const youtubeFrame = document.getElementById("youtubeFrame");
const telegramLink = document.getElementById("telegramLink");
const modalClose = document.querySelector(".close-btn");

// ===== Student guard =====
const matric = sessionStorage.getItem("matric");
if (!matric) {
  alert("Please login first.");
  window.location.href = "login.html";
}

// ===== Month helper (object version) =====
function monthToNumber(month) {
  const months = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12
  };
  return months[month.toLowerCase()] || 0;
}

// ===== Fetch videos =====
async function loadVideos() {
  try {
    // 1️⃣ Fetch all paid, active payments for this student
    const { data: payments, error: payError } = await sb
      .from("payments")
      .select("*")
      .eq("matric_number", matric)
      .eq("status", "paid")
      .eq("deleted", false)
      .order("created_at", { ascending: false });

    if (payError) throw payError;

    if (!payments || payments.length === 0) {
      videosGrid.innerHTML = `<p>${t("No payments found. Complete a payment to unlock videos.")}</p>`;
      return;
    }

    console.log("Student payments:", payments);

    // 2️⃣ Fetch videos
    const { data: videos, error: videoError } = await sb
      .from("videos")
      .select("*")
      .order("created_at", { ascending: true });

    if (videoError) throw videoError;
    if (!videos || videos.length === 0) {
      videosGrid.innerHTML = `<p>${t("No videos found")}</p>`;
      return;
    }

    console.log("Videos fetched:", videos);

    // 3️⃣ Render video cards
    videosGrid.innerHTML = "";
    videos.forEach(video => {
      const videoCard = document.createElement("div");
      videoCard.classList.add("video-card");

      // Set YouTube thumbnail as background
      videoCard.style.backgroundImage = `url('https://img.youtube.com/vi/${video.youtube_link}/hqdefault.jpg')`;

      // Determine if unlocked: any payment month >= video month
      const videoMonthNum = monthToNumber(video.month);
      const hasPaidForVideo = payments.some(p => monthToNumber(p.month) >= videoMonthNum);

      if (!hasPaidForVideo) videoCard.classList.add("locked");

      // HTML structure
      videoCard.innerHTML = `
        <h3>${video.title}</h3>
        <div class="play-overlay">
          <button class="play-btn"></button>
        </div>
        ${!hasPaidForVideo ? `<div class="lock-overlay">${t("🔒 Complete your payment to unlock this video")}</div>` : ''}
        <button class="watch-btn">${hasPaidForVideo ? t("Watch Video") : t("Locked")}</button>
      `;

      // Select buttons
      const playBtn = videoCard.querySelector(".play-btn");
      const watchBtn = videoCard.querySelector(".watch-btn");

      // Open modal when clicking either play or watch button
      [playBtn, watchBtn].forEach(btn => {
        btn.addEventListener("click", () => {
          if (!hasPaidForVideo) {
            alert(t("🔒 Complete your payment to unlock this video"));
            return;
          }

          youtubeFrame.src = `https://www.youtube.com/embed/${video.youtube_link}`;
          telegramLink.href = video.telegram_link;
          videoModal.style.display = "flex";
        });
      });

      videosGrid.appendChild(videoCard);
    });

    // ===== Modal close =====
    modalClose.addEventListener("click", () => {
      videoModal.style.display = "none";
      youtubeFrame.src = "";
    });

    window.addEventListener("click", e => {
      if (e.target === videoModal) {
        videoModal.style.display = "none";
        youtubeFrame.src = "";
      }
    });

  } catch (err) {
    console.error("Error loading videos:", err);
    videosGrid.innerHTML = `<p style="color:red">${t("Failed to load videos")}</p>`;
  }
}

// ===== Run =====
document.addEventListener("DOMContentLoaded", loadVideos);
