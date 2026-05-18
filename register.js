document.addEventListener("DOMContentLoaded", () => {
  // ===========================
  // 1️⃣ Supabase Client from HTML
  // ===========================
  const sb = window.sb; // Supabase client from <script> in HTML

  if (!sb) {
    console.error(t("Supabase client not found"));
    return;
  }

  console.log("Register JS connected to Supabase:", sb);

  // ===========================
  // 2️⃣ Elements
  // ===========================
  const form = document.getElementById("registration-form");
  const passportInput = document.getElementById("passport");
  const passportPreview = document.getElementById("passport-preview");
  const passportWarning = document.getElementById("passport-warning");
  const submitBtn = document.querySelector('.submit-btn');

  if (!form) return;

  // ===========================
  // 3️⃣ Form Submit
  // ===========================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      // ----- Gather form data -----
      const formData = new FormData(form);

      const fullName = formData.get("fullname")?.trim();
      const email = formData.get("email")?.trim();
      const gender = formData.get("gender");
      const age = formData.get("age");
      const nationality = formData.get("nationality")?.trim();
      const country = formData.get("country")?.trim();
      const whatsapp = formData.get("whatsapp")?.trim();
      const levelArabic = formData.get("levelArabic");
      const readQuran = formData.get("readQuran");
      const attendOnline = formData.get("attendOnline");
      const hearAbout = formData.get("hearAbout");
      const classTime = formData.get("classTime")?.trim();
      const reasonArabic = formData.get("reasonArabic");
      const additional = formData.get("additional")?.trim();

      if (!email || !fullName) {
        alert(t("Full Name and Email are required."));
        return;
      }

      // ----- Check if student already registered -----
      const { data: existingStudent, error: checkError } = await sb
        .from("students")
        .select("matric_number")
        .eq("email", email)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        // Some other Supabase error
        console.error(checkError);
        alert(t("Could not check existing registration. See console."));
        return;
      }

      if (existingStudent) {
        alert(t(`This email is already registered!\nMatric Number: ${existingStudent.matric_number}`));
        return;
      }

      // ----- Passport Upload -----
      let passportUrl = null;
      const passportFile = passportInput.files[0];

      if (passportFile) {
        if (passportFile.size > 2 * 1024 * 1024) { // 2MB max
          passportWarning.textContent = t("Passport must not exceed 2MB");
          passportWarning.style.display = "block";
          return;
        }

        passportWarning.style.display = "none";

        const fileExt = passportFile.name.split(".").pop();
        const fileName = `passport_${Date.now()}.${fileExt}`;

        // Upload to 'passports' bucket
        const { error: uploadError } = await sb.storage
          .from("passports")
          .upload(fileName, passportFile);

        if (uploadError) {
          console.error(uploadError);
          alert(t("Passport upload failed. Check console."));
          return;
        }

        // Get public URL
        const { data: urlData } = sb.storage
          .from("passports")
          .getPublicUrl(fileName);

        passportUrl = urlData.publicUrl;
      }

      // Disable button and show processing
      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = t('Processing... ⏳');

      // ----- Insert Student -----
      const { data, error } = await sb
        .from("students")
        .insert([
          {
            fullname: fullName,
            email: email,
            gender: gender,
            age: Number(age),
            nationality: nationality,
            country: country,
            whatsapp: whatsapp,
            level_arabic: levelArabic,
            read_quran: readQuran,
            attend_online: attendOnline,
            hear_about: hearAbout,
            class_time: classTime,
            reason_arabic: reasonArabic,
            additional: additional,
            passport_url: passportUrl
          }
        ])
        .select("matric_number")
        .single(); // Return the inserted row

      if (error) {
        console.error(error);
        alert(t("Registration failed. Check console for details."));
        return;
      }

      // ----- Success Notification with Matric Number -----
function showSuccessNotification(matricNumber) {
  // Remove any existing toast
  document.querySelector(".success-toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "success-toast";
  toast.innerHTML = `
    <p>${tmpl("registration_successful")}</p>
    <p>${tmpl("matric_info", { matric: `<strong>${matricNumber}</strong>` })}</p>
    <button id="copyMatricBtn">${tmpl("copy")}</button>
  `;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add("show"), 10);

  // Copy button
document.getElementById("copyMatricBtn").onclick = () => {
  navigator.clipboard.writeText(matricNumber).then(() => {
    alert(t("Matric Number copied to clipboard ✅"));
  });
};

  // Auto-remove after 10s
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 10000);
}

showSuccessNotification(data.matric_number);

      form.reset();
      passportPreview.src = "passport-placeholder.png";

    } catch (err) {
      console.error(err);
      alert(t("Unexpected error occurred. Check console."));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Register';
    }
  });

  // ===========================
  // 4️⃣ Passport Preview
  // ===========================
  passportInput.addEventListener("change", () => {
    const file = passportInput.files[0];
    if (!file) {
      passportPreview.src = "passport-placeholder.png";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      passportPreview.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
});