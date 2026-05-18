console.log("REGISTER COURSES PAGE LOADED");

async function initRegisterCourses() {

  const container = document.getElementById("coursesContainer");

  const matric = sessionStorage.getItem("matric");

  // 🔐 REQUIRE LOGIN
  if (!matric) {
    window.location.href = "login.html";
    return;
  }

  // =========================
  // FETCH ALL COURSES
  // =========================
  const { data: courses, error: courseError } = await sb
    .from("courses")
    .select("*");

  if (courseError) {
    console.error(courseError);
    return;
  }

  // =========================
  // FETCH REGISTERED COURSES
  // =========================
  const { data: registered } = await sb
    .from("course_registrations")
    .select("course_id")
    .eq("matric_number", matric);

  const registeredIds = registered.map(r => r.course_id);

  // =========================
  // DISPLAY COURSES
  // =========================
  container.innerHTML = courses.map(course => {

    const isRegistered = registeredIds.includes(course.id);

    return `
      <div class="course-card">
  <h3>${course.course_name}</h3>

  <p><strong>${tmpl("level")}:</strong> ${course.level || "-"}</p>
  <p><strong>${tmpl("instructor")}:</strong> ${course.instructor || "-"}</p>

  <button 
    class="register-btn"
    data-id="${course.id}"
    data-registered="${isRegistered}"
  >
    ${isRegistered ? tmpl("registered") : tmpl("register")}
  </button>
</div>
    `;
  }).join("");

  // =========================
  // HANDLE CLICK
  // =========================
  document.querySelectorAll(".register-btn").forEach(btn => {

    btn.addEventListener("click", async () => {

      const courseId = btn.dataset.id;
      const isRegistered = btn.dataset.registered === "true";

      // =====================
      // UNREGISTER
      // =====================
      if (isRegistered) {

        await sb
          .from("course_registrations")
          .delete()
          .eq("course_id", courseId)
          .eq("matric_number", matric);

        btn.textContent = "Register";
        btn.dataset.registered = "false";
        return;
      }

      // =====================
      // REGISTER
      // =====================
      const { error } = await sb
        .from("course_registrations")
        .insert([{
          matric_number: matric,
          course_id: courseId
        }]);

      if (error) {
        alert("Error registering");
        return;
      }

      btn.textContent = "✅ Registered";
      btn.dataset.registered = "true";
    });

  });

}

initRegisterCourses();