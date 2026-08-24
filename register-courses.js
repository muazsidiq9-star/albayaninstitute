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

    /* ── 2. Fetch ALL courses for this level ── */
    const { data: allCourses, error: courseError } = await sb
      .from("courses")
      .select("*")
      .eq("level", studentLevel);

    if (courseError) {
      console.error("❌ Courses error:", courseError);
      container.innerHTML = `<p>Error loading courses.</p>`;
      return;
    }

    /* ── 3. THREE-TIER FILTER (same as exam page) ── */
    const courses = (allCourses || []).filter(course => {
      const batchMatch  = !course.batch  || course.batch  === studentBatch;
      const matricMatch = !course.matric_number || course.matric_number === matric;
      return batchMatch && matricMatch;
    });

    console.log("📚 Filtered courses:", courses.length, courses);

    /* ── 4. What is already registered? ── */
    const { data: registered, error: regError } = await sb
      .from("course_registrations")
      .select("course_id")
      .eq("matric_number", matric);

    if (regError) console.error("❌ Reg fetch error:", regError);

    const registeredIds = (registered || []).map(r => String(r.course_id));
    console.log("✅ Already registered:", registeredIds);

    /* ── 5. Render ── */
    if (!courses.length) {
      container.innerHTML = `<p>No courses available for your level/batch.</p>`;
      return;
    }

    container.innerHTML = courses.map((course, i) => {
      const isRegistered = registeredIds.includes(String(course.id));
      return `
        <div class="course-card visible" style="transition-delay:${i * 60}ms">
          <h3>${course.course_name}</h3>
          <p><strong>Level:</strong> ${course.level || "—"}</p>
          <p><strong>Batch:</strong> ${course.batch || "All Batches"}</p>
          <p><strong>Instructor:</strong> ${course.instructor || "—"}</p>
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
            console.log("➕ Inserting:", { matric, courseId });
            const { data, error } = await sb
              .from("course_registrations")
              .insert([{ matric_number: matric, course_id: courseId }])
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