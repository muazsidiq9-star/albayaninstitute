console.log("MY COURSES JS LOADED");
document.addEventListener("DOMContentLoaded", async () => {

  const coursesContainer = document.getElementById("coursesContainer");

  // get matric from session or fallback to localStorage
  const matric =
    sessionStorage.getItem("matric") ||
    JSON.parse(localStorage.getItem("currentStudent"))?.matric;

  if (!coursesContainer) {
  console.log("Container not found");
  return;
}

if (!matric) {
  window.location.href = "login.html";
  return;
}
console.log("Matric:", matric);
console.log("Container:", coursesContainer);
  // =========================
  // FETCH REGISTERED COURSES
  // =========================
  const { data, error } = await sb
    .from("course_registrations")
    .select(`
      id,
      courses (
        course_name,
        instructor,
        level
      )
    `)
    .eq("matric_number", matric);

  if (error) {
    console.error(error);
    coursesContainer.innerHTML = `<p class="no-courses">Error loading courses</p>`;
    return;
  }

  // =========================
// DISPLAY
// =========================
if (!data.length) {
  coursesContainer.innerHTML = `
    <p class="no-courses">
      ${tmpl("no_courses")}
    </p>
  `;
  return;
}

data.forEach(item => {
  const c = item.courses;

  const card = document.createElement("div");
  card.className = "course-card";

  card.innerHTML = `
    <h3>${c.course_name}</h3>

    <p><strong>${tmpl("instructor")}:</strong> ${c.instructor || "-"}</p>
    <p><strong>${tmpl("level")}:</strong> ${c.level || "-"}</p>

    <button class="view-schedule-btn" data-course="${c.course_name}">
      ${tmpl("view_schedule")}
    </button>

    <button class="remove-btn" data-id="${item.id}">
      ${tmpl("unregister")}
    </button>
  `;

  coursesContainer.appendChild(card);
});

  // =========================
  // VIEW SCHEDULE
  // =========================
  document.querySelectorAll(".view-schedule-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const courseName = e.target.dataset.course;
      localStorage.setItem("viewCourseFilter", courseName);
      window.location.href = "schedule.html";
    });
  });

  // =========================
  // UNREGISTER
  // =========================
  document.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;

      if (!confirm("Remove this course?")) return;

      const { error } = await sb
        .from("course_registrations")
        .delete()
        .eq("id", id);

      if (error) {
        alert("Failed to remove");
        return;
      }

      location.reload();
    });
  });

});