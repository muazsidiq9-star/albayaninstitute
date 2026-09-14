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
        level,
        batch,
        courses (
          id,
          course_name,
          course_levels ( level )
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

    // Instructor now lives on course_sections (a course can have several
    // instructor+batch pairs), so look up the section that matches each
    // registration's own batch — falling back to a batch-open section,
    // then to whatever section exists, same priority as the registration page.
    const courseIds = [...new Set(data.map(item => item.courses?.id).filter(Boolean))];
    let sectionsByCourse = {};

    if (courseIds.length) {
      const { data: sectionRows, error: sectionError } = await sb
        .from("course_sections")
        .select("course_id, instructor, batch")
        .in("course_id", courseIds);

      if (sectionError) console.error("❌ Sections fetch error:", sectionError);

      (sectionRows || []).forEach(row => {
        if (!sectionsByCourse[row.course_id]) sectionsByCourse[row.course_id] = [];
        sectionsByCourse[row.course_id].push(row);
      });
    }

    function findInstructor(courseId, batch) {
      const sections = sectionsByCourse[courseId] || [];
      if (!sections.length) return null;
      const exact = sections.find(s => s.batch && s.batch === batch);
      if (exact) return exact.instructor;
      const open = sections.find(s => !s.batch);
      if (open) return open.instructor;
      return sections[0].instructor;
    }

    data.forEach(item => {
      const c = item.courses;
      if (!c) return;

      const levels = (c.course_levels || []).map(cl => cl.level);
      const levelDisplay = levels.length ? levels.join(", ") : "—";
      const instructor = findInstructor(c.id, item.batch);

      const card = document.createElement("div");
      card.className = "course-card";

      card.innerHTML = `
        <h3>${c.course_name}</h3>
        <p><strong>Instructor:</strong> ${instructor || "—"}</p>
        <p><strong>Level:</strong> ${levelDisplay}</p>
        <p><strong>Batch:</strong> ${item.batch || "All"}</p>
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