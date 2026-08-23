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
  const planTypeSelect = document.getElementById("planType");
  const planPriceStrip = document.getElementById("planPriceStrip");
  const countrySelect = document.getElementById("country");

  if (!form) return;

  // ===========================
  // Country-based Plan Rendering
  // ===========================
  const WEST_AFRICA_COUNTRIES = [
    "nigeria", "ghana", "benin", "togo", "niger", "cameroon",
    "senegal", "mali", "burkina faso", "guinea", "guinea-bissau",
    "sierra leone", "liberia", "ivory coast", "gambia",
    "cape verde", "mauritania"
  ];

  function isWestAfrica(countryRaw) {
    if (!countryRaw) return false;
    return WEST_AFRICA_COUNTRIES.includes(countryRaw.trim().toLowerCase());
  }

  function attachPlanCardListeners() {
    document.querySelectorAll(".plan-price-card").forEach((card) => {
      card.addEventListener("click", () => {
        planTypeSelect.value = card.dataset.plan;
        document.querySelectorAll(".plan-price-card").forEach(c => c.classList.remove("selected"));
        card.classList.add("selected");
      });
    });
  }

  function renderPlanOptions() {
    const country = countrySelect.value;

    if (!country) {
      planPriceStrip.innerHTML = `
        <p class="plan-price-hint" data-translate="Please select your country in Step 1 first.">
          Please select your country in Step 1 first.
        </p>`;
      planTypeSelect.innerHTML = `<option value="" data-translate="Select">Select</option>`;
      if (typeof translate === "function") translate(localStorage.getItem("lang") || "en");
      return;
    }

    const westAfrica = isWestAfrica(country);

    if (westAfrica) {
      planTypeSelect.innerHTML = `
        <option value="" data-translate="Select">Select</option>
        <option value="General" data-translate="General">General</option>
        <option value="Premium" data-translate="Premium">Premium</option>
      `;
      planPriceStrip.innerHTML = `
        <div class="plan-price-card" data-plan="General" data-amount="10000" data-currency="NGN">
          <span class="plan-price-name" data-translate="General">General</span>
          <span class="plan-price-amount">₦10,000<small data-translate="/month">/month</small></span>
        </div>
        <div class="plan-price-card" data-plan="Premium" data-amount="50000" data-currency="NGN">
          <span class="plan-price-name" data-translate="Premium">Premium</span>
          <span class="plan-price-amount">₦50,000<small data-translate="/month">/month</small></span>
        </div>
      `;
    } else {
      planTypeSelect.innerHTML = `<option value="Premium" selected>Premium</option>`;
      planPriceStrip.innerHTML = `
        <div class="plan-price-card selected" data-plan="Premium" data-amount="50" data-currency="USD">
          <span class="plan-price-name" data-translate="Premium">Premium</span>
          <span class="plan-price-amount">$50<small data-translate="/month">/month</small></span>
        </div>
      `;
    }

    attachPlanCardListeners();
    if (typeof translate === "function") translate(localStorage.getItem("lang") || "en");
  }

  if (countrySelect && planTypeSelect && planPriceStrip) {
    countrySelect.addEventListener("change", renderPlanOptions);
    renderPlanOptions();
  }

  // Reads amount + currency from the selected plan card (single source of truth for pricing)
  function getSelectedPlanPricing() {
    const selectedPlan = planTypeSelect.value;
    const card = document.querySelector(`.plan-price-card[data-plan="${selectedPlan}"]`);
    if (!card) return { amount: null, currency: null };
    return {
      amount: Number(card.dataset.amount) || null,
      currency: card.dataset.currency || null
    };
  }

  // ===========================
  // 3️⃣ Form Submit
  // ===========================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

 // Disable button and show processing
      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = t('Processing... ⏳');
      
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
      const planType = formData.get("planType");
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

      const agreeTermsCheckbox = document.getElementById("agreeTerms");
      if (agreeTermsCheckbox && !agreeTermsCheckbox.checked) {
        alert(t("Please agree to the Terms & Conditions, Privacy Policy, and Refund Policy before submitting."));
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


      // ----- Derive pricing from the selected plan card -----
      const { amount: amountDue, currency: currencyDue } = getSelectedPlanPricing();

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
            plan_type: planType,
            read_quran: readQuran,
            attend_online: attendOnline,
            hear_about: hearAbout,
            class_time: classTime,
            reason_arabic: reasonArabic,
            additional: additional,
            passport_url: passportUrl,
            payment_status: "unpaid",
            amount_due: amountDue,
            currency_due: currencyDue
          }
        ])
        .select("matric_number")
        .single(); // Return the inserted row

         if (error) {
        console.error(error);
        alert(t("Registration failed. Check console for details."));
        return;
      }

try {
  const response = await fetch(
    "https://api.web3forms.com/submit",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        access_key: "73556940-2533-43e1-8458-aab6b0e894dc",
        subject: "New Student Registration 🎓",
        message: `
A new student just registered:

Name: ${fullName}
Email: ${email}
WhatsApp: ${whatsapp}
Country: ${country}
Level: ${levelArabic}
Plan: ${planType}
Matric: ${data.matric_number}
Passport: ${passportUrl || "Not uploaded"}
        `
      })
    }
  );

  const result = await response.json();

  if (!result.success) {
    console.error("Web3Forms error:", result);
  }

} catch (emailError) {
  console.error("Registration email failed:", emailError);
}

      // ----- Success Notification with Matric Number -----
function showSuccessNotification(matricNumber) {
  // Remove any existing toast
  document.querySelector(".success-toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "success-toast";
  toast.innerHTML = `
  <p>
    <i class="fa-solid fa-circle-check"></i>
    ${tmpl("registration_successful")}
  </p>

  <p>
    ${tmpl("matric_info", {
      matric: `<strong>${matricNumber}</strong>`
    })}
  </p>

  <button id="copyMatricBtn">
    <i class="fa-solid fa-copy"></i>
    ${tmpl("copy")}
  </button>
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
      submitBtn.innerHTML = originalText;
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