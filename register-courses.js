console.log("REGISTER COURSES PAGE LOADED");

document.addEventListener("DOMContentLoaded", async () => {
  await initRegisterCourses();
});

async function initRegisterCourses() {
  const container = document.getElementById("coursesContainer");
  if (!container) {
    console.error("❌ coursesContainer not found");
    return;
  }

  const matric = sessionStorage.getItem("matric");
  if (!matric) {
    window.location.href = "login.html";
    return;
  }

  try {
    /* ── 1. Who is this student? ── */
    const { data: studentProfile, error: profileError } = await sb
      .from("students")
      .select("level_arabic, batch")
      .eq("matric_number", matric)
      .single();

    if (profileError || !studentProfile) {
      console.error("❌ Profile error:", profileError);
      container.innerHTML = `<p>Unable to load your profile.</p>`;
      return;
    }

    const studentLevel = studentProfile.level_arabic;
    const studentBatch = studentProfile.batch || "";
    console.log("👤 Student:", { matric, level: studentLevel, batch: studentBatch });

    /* ── Helper: pick the section that applies to this student's batch ──
       A course can have several instructor+batch sections now. Prefer an
       exact batch match; fall back to a section left open to every batch
       (blank batch). Returns null if nothing matches. */
    function findMatchingSection(sections, batch) {
      if (!sections || !sections.length) return null;
      const exact = sections.find(s => s.batch && s.batch === batch);
      if (exact) return exact;
      return sections.find(s => !s.batch) || null;
    }

    /* ── 2. Which courses are tagged for this student's level? ──
       A course can now be tagged for multiple levels (e.g. Advanced AND
       Intermediate sharing the same course), via course_levels. */
    const { data: levelRows, error: levelError } = await sb
      .from("course_levels")
      .select("course_id")
      .eq("level", studentLevel);

    if (levelError) {
      console.error("❌ Course levels error:", levelError);
      container.innerHTML = `<p>Error loading courses.</p>`;
      return;
    }

    const eligibleCourseIds = (levelRows || []).map(r => r.course_id);

    let levelCourses = [];
    if (eligibleCourseIds.length) {
      const { data, error: courseError } = await sb
        .from("courses")
        .select("*")
        .in("id", eligibleCourseIds)
        .eq("deleted", false);

      if (courseError) {
        console.error("❌ Courses error:", courseError);
        container.innerHTML = `<p>Error loading courses.</p>`;
        return;
      }
      levelCourses = data || [];
    }

    /* ── 3. Fetch explicit overrides for this student (carryover, etc.) ──
       These bypass level/batch entirely — an admin has to grant them
       individually, so there's no risk of exposing a course to a whole
       cohort by accident. */
    const { data: overrides, error: overrideError } = await sb
      .from("course_access_overrides")
      .select("course_id")
      .eq("matric_number", matric);

    if (overrideError) console.error("❌ Override fetch error:", overrideError);

    const overrideIds = (overrides || []).map(o => o.course_id);
    let overrideCourses = [];

    if (overrideIds.length) {
      const { data: overrideCourseRows, error: overrideCourseError } = await sb
        .from("courses")
        .select("*")
        .in("id", overrideIds)
        .eq("deleted", false);

      if (overrideCourseError) console.error("❌ Override courses error:", overrideCourseError);
      overrideCourses = overrideCourseRows || [];
    }

    /* ── 3b. Fetch every instructor+batch section for the courses we might
       show, so we can (a) decide which cohort courses are actually open
       to this student's batch, and (b) show the right instructor/batch
       on each card. A course with zero sections on file is treated as
       legacy/open-to-everyone, same as the old blank-batch behavior. */
    const sectionCourseIds = [...new Set([
      ...levelCourses.map(c => c.id),
      ...overrideCourses.map(c => c.id)
    ])];

    let sectionsByCourse = {};
    if (sectionCourseIds.length) {
      const { data: sectionRows, error: sectionError } = await sb
        .from("course_sections")
        .select("course_id, instructor, batch")
        .in("course_id", sectionCourseIds);

      if (sectionError) console.error("❌ Course sections error:", sectionError);

      (sectionRows || []).forEach(row => {
        if (!sectionsByCourse[row.course_id]) sectionsByCourse[row.course_id] = [];
        sectionsByCourse[row.course_id].push(row);
      });
    }

    const cohortCourses = levelCourses.filter(course => {
      const sections = sectionsByCourse[course.id] || [];
      // No sections on file yet = legacy/open course, same as old blank-batch behavior.
      if (!sections.length) return true;
      return !!findMatchingSection(sections, studentBatch);
    });

    /* ── 4. Merge, de-duped by course id ── */
    const courseMap = new Map();
    cohortCourses.forEach(c => courseMap.set(c.id, { ...c, isOverride: false }));
    overrideCourses.forEach(c => {
      if (!courseMap.has(c.id)) courseMap.set(c.id, { ...c, isOverride: true });
    });
    const courses = Array.from(courseMap.values());

    console.log("📚 Cohort + override courses:", courses.length, courses);

    /* ── 4b. Fetch each course's real tagged levels for display ──
       course.level only ever holds the first level picked when the course
       was created; course_levels is the accurate multi-level list. */
    const allCourseIds = courses.map(c => c.id);
    const levelsByCourse = {};

    if (allCourseIds.length) {
      const { data: allLevelRows, error: allLevelError } = await sb
        .from("course_levels")
        .select("course_id, level")
        .in("course_id", allCourseIds);

      if (allLevelError) console.error("❌ Course levels (display) error:", allLevelError);

      (allLevelRows || []).forEach(row => {
        if (!levelsByCourse[row.course_id]) levelsByCourse[row.course_id] = [];
        levelsByCourse[row.course_id].push(row.level);
      });
    }

    /* ── 5. What is already registered? ── */
    const { data: registered, error: regError } = await sb
      .from("course_registrations")
      .select("course_id")
      .eq("matric_number", matric);

    if (regError) console.error("❌ Reg fetch error:", regError);

    const registeredIds = (registered || []).map(r => String(r.course_id));
    console.log("✅ Already registered:", registeredIds);

    /* ── 6. Render ── */
    if (!courses.length) {
      container.innerHTML = `<p>No courses available for your level/batch.</p>`;
      return;
    }

    container.innerHTML = courses.map((course, i) => {
      const isRegistered = registeredIds.includes(String(course.id));
      const levels = levelsByCourse[course.id] || (course.level ? [course.level] : []);

      const sections = sectionsByCourse[course.id] || [];
      const matchedSection = findMatchingSection(sections, studentBatch)
        || (course.isOverride ? sections[0] : null)
        || null;
      const displayBatch = matchedSection
        ? (matchedSection.batch || "All Batches")
        : (sections.length ? "Multiple batches available" : "All Batches");
      const displayInstructor = matchedSection ? (matchedSection.instructor || "—") : "—";

      return `
        <div class="course-card visible" style="transition-delay:${i * 60}ms">
          <h3>${course.course_name}${course.isOverride ? ` <span class="course-override-badge" style="font-size:11px;font-weight:normal;color:#8a6d00;background:#fff3cd;padding:2px 8px;border-radius:10px;">Special Access</span>` : ""}</h3>
          <p><strong>Level:</strong> ${levels.length ? levels.join(", ") : "—"}</p>
          <p><strong>Batch:</strong> ${displayBatch}</p>
          <p><strong>Instructor:</strong> ${displayInstructor}</p>
          <button 
            class="register-btn ${isRegistered ? "registered" : ""}"
            data-id="${course.id}"
            data-registered="${isRegistered}"
          >
            ${isRegistered ? "Registered" : "Register"}
          </button>
        </div>
      `;
    }).join("");

    /* ── 6. Button clicks ── */
    document.querySelectorAll(".register-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const courseId = btn.dataset.id;
        const isRegistered = btn.dataset.registered === "true";
        btn.disabled = true;

        if (isRegistered) {
          /* ── UNREGISTER ── */
          try {
            console.log("🗑️ Deleting:", { matric, courseId });
            const { data, error } = await sb
              .from("course_registrations")
              .delete()
              .eq("course_id", courseId)
              .eq("matric_number", matric);

            if (error) {
              console.error("❌ Delete error:", error);
              alert("Failed to unregister: " + error.message);
              btn.disabled = false;
              return;
            }

            console.log("🗑️ Delete result:", data);
            btn.textContent = "Register";
            btn.dataset.registered = "false";
            btn.classList.remove("registered");
          } catch (err) {
            console.error("❌ Unregister exception:", err);
            alert("Error: " + err.message);
            btn.disabled = false;
          }

        } else {
          /* ── REGISTER ── */
          try {
            console.log("➕ Inserting:", { matric, courseId, level: studentLevel, batch: studentBatch });
            const { data, error } = await sb
              .from("course_registrations")
              .insert([{ matric_number: matric, course_id: courseId, level: studentLevel || null, batch: studentBatch || null }])
              .select();

            if (error) {
              console.error("❌ Insert error:", error);
              // Already registered? (unique violation = 23505)
              if (error.code === "23505" || error.message.includes("duplicate")) {
                btn.textContent = "Registered";
                btn.dataset.registered = "true";
                btn.classList.add("registered");
                alert("You were already registered.");
              } else {
                alert("Failed to register: " + error.message);
              }
              btn.disabled = false;
              return;
            }

            console.log("➕ Insert result:", data);
            btn.textContent = "Registered";
            btn.dataset.registered = "true";
            btn.classList.add("registered");
          } catch (err) {
            console.error("❌ Register exception:", err);
            alert("Error: " + err.message);
            btn.disabled = false;
          }
        }
      });
    });

  } catch (err) {
    console.error("❌ Init error:", err);
    container.innerHTML = `<p>Error initializing page.</p>`;
  }
}