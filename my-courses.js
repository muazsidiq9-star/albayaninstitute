console.log("MY COURSES JS LOADED");

document.addEventListener("DOMContentLoaded", async () => {
  const coursesContainer = document.getElementById("coursesContainer");
  if (!coursesContainer) {
    console.error("❌ coursesContainer not found");
    return;
  }

  const matric =
    sessionStorage.getItem("matric") ||
    JSON.parse(localStorage.getItem("currentStudent") || "{}")?.matric;

  if (!matric) {
    window.location.href = "login.html";
    return;
  }

  console.log("👤 My courses — matric:", matric);

  try {
    const { data, error } = await sb
      .from("course_registrations")
      .select(`
        id,
        courses (
          course_name,
          instructor,
          level,
          batch
        )
      `)
      .eq("matric_number", matric);

    if (error) {
      console.error("❌ Fetch error:", error);
      coursesContainer.innerHTML = `<p class="no-courses">Error loading courses</p>`;
      return;
    }

    if (!data || !data.length) {
      coursesContainer.innerHTML = `<p class="no-courses">You have not registered for any courses yet.</p>`;
      return;
    }

    data.forEach(item => {
      const c = item.courses;
      const card = document.createElement("div");
      card.className = "course-card";

      card.innerHTML = `
        <h3>${c.course_name}</h3>
        <p><strong>Instructor:</strong> ${c.instructor || "—"}</p>
        <p><strong>Level:</strong> ${c.level || "—"}</p>
        <p><strong>Batch:</strong> ${c.batch || "All"}</p>
        <button class="view-schedule-btn" data-course="${c.course_name}">
          View Schedule
        </button>
        <button class="remove-btn" data-id="${item.id}">
          Unregister
        </button>
      `;
      coursesContainer.appendChild(card);
    });

    /* View schedule */
    document.querySelectorAll(".view-schedule-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const courseName = e.target.dataset.course;
        localStorage.setItem("viewCourseFilter", courseName);
        window.location.href = "schedule.html";
      });
    });

    /* Unregister */
    document.querySelectorAll(".remove-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        if (!confirm("Remove this course?")) return;

        try {
          console.log("🗑️ Unregister id:", id);
          const { error } = await sb
            .from("course_registrations")
            .delete()
            .eq("id", id);

          if (error) {
            console.error("❌ Delete error:", error);
            alert("Failed to remove: " + error.message);
            return;
          }

          location.reload();
        } catch (err) {
          console.error("❌ Exception:", err);
          alert("Error: " + err.message);
        }
      });
    });

  } catch (err) {
    console.error("❌ Page error:", err);
    coursesContainer.innerHTML = `<p class="no-courses">Error loading page</p>`;
  }
});