// ===========================
// 0️⃣ Passport Compression Helper
// Resizes + compresses the image in-browser before it ever
// reaches Supabase Storage, so egress per file stays tiny.
// ===========================
async function compressPassportImage(file, {
  maxWidth = 500,
  maxHeight = 500,
  quality = 0.75,
  maxSizeKB = 150
} = {}) {
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  let { width, height } = img;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);

  let q = quality;
  let blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));

  // Step quality down further if it's still bigger than our target
  while (blob && blob.size / 1024 > maxSizeKB && q > 0.3) {
    q -= 0.1;
    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
  }

  return new File(
    [blob],
    file.name.replace(/\.\w+$/, ".jpg"),
    { type: "image/jpeg" }
  );
}

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

    // ===========================
  // Auto-populate Batch with current Month Year
  // ===========================
  const batchInput = document.getElementById("batch");
  if (batchInput && !batchInput.value) {
    const now = new Date();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    batchInput.value = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  }

  if (!form) return;

  // ===========================
  // Country-based Plan Rendering
  // ===========================

  // Full list of African countries (all 54), lowercase. Written out once so
  // adding/removing countries from the register.html dropdown later never
  // requires touching this file — any African country typed/selected here
  // is automatically recognized.
  const AFRICA_COUNTRIES = [
    "algeria", "angola", "benin", "botswana", "burkina faso", "burundi",
    "cabo verde", "cape verde", "cameroon", "central african republic", "chad",
    "comoros", "democratic republic of the congo", "dr congo", "congo",
    "republic of the congo", "djibouti", "egypt", "equatorial guinea",
    "eritrea", "eswatini", "swaziland", "ethiopia", "gabon", "gambia",
    "ghana", "guinea", "guinea-bissau", "ivory coast", "cote d'ivoire",
    "côte d'ivoire", "kenya", "lesotho", "liberia", "libya", "madagascar",
    "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique",
    "namibia", "niger", "nigeria", "rwanda", "sao tome and principe",
    "senegal", "seychelles", "sierra leone", "somalia", "south africa",
    "south sudan", "sudan", "tanzania", "togo", "tunisia", "uganda",
    "zambia", "zimbabwe"
  ];

  function isAfrica(countryRaw) {
    if (!countryRaw) return false;
    return AFRICA_COUNTRIES.includes(countryRaw.trim().toLowerCase());
  }

  // Currency display symbols/prefixes used when formatting plan prices.
  const CURRENCY_SYMBOLS = {
    NGN: "₦",
    GHS: "GH₵",
    SLE: "Le ",
    USD: "$"
  };

  function formatPrice(amount, currency) {
    const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
    return `${symbol}${Number(amount).toLocaleString()}`;
  }

  // Single source of truth for pricing per country. Returns an object keyed
  // by plan name ("General" / "Premium"), each with { amount, currency }.
  function getPricingForCountry(countryRaw) {
    const country = (countryRaw || "").trim().toLowerCase();

    if (country === "nigeria") {
      return {
        General: { amount: 10000, currency: "NGN" },
        Premium: { amount: 50000, currency: "NGN" }
      };
    }

    if (country === "ghana") {
      return {
        General: { amount: 100, currency: "GHS" },
        Premium: { amount: 500, currency: "GHS" }
      };
    }

    if (country === "sierra leone") {
      return {
        General: { amount: 200, currency: "SLE" },
        Premium: { amount: 1000, currency: "SLE" }
      };
    }

    if (isAfrica(country)) {
      // Other African countries: flat USD pricing
      return {
        General: { amount: 10, currency: "USD" },
        Premium: { amount: 50, currency: "USD" }
      };
    }

    // International (outside Africa): single Premium plan, unchanged
    return {
      Premium: { amount: 50, currency: "USD" }
    };
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

    const pricing = getPricingForCountry(country);
    const plans = Object.keys(pricing); // e.g. ["General", "Premium"] or just ["Premium"]

    if (plans.length > 1) {
      planTypeSelect.innerHTML = `
        <option value="" data-translate="Select">Select</option>
        ${plans.map(plan => `<option value="${plan}" data-translate="${plan}">${plan}</option>`).join("")}
      `;
    } else {
      // Only one plan available (international students) — auto-select it
      planTypeSelect.innerHTML = `<option value="${plans[0]}" selected>${plans[0]}</option>`;
    }

    planPriceStrip.innerHTML = plans.map((plan, i) => {
      const { amount, currency } = pricing[plan];
      const selectedClass = plans.length === 1 ? "selected" : "";
      return `
        <div class="plan-price-card ${selectedClass}" data-plan="${plan}" data-amount="${amount}" data-currency="${currency}">
          <span class="plan-price-name" data-translate="${plan}">${plan}</span>
          <span class="plan-price-amount">${formatPrice(amount, currency)}<small data-translate="/month">/month</small></span>
        </div>
      `;
    }).join("");

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
      const batch = formData.get("batch")?.trim() || null;
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
      let passportPath = null;
      const passportFile = passportInput.files[0];

      if (passportFile) {
        if (passportFile.size > 8 * 1024 * 1024) { // 8MB sanity cap on the raw photo
          passportWarning.textContent = t("Passport image is too large (max 8MB)");
          passportWarning.style.display = "block";
          return;
        }

        passportWarning.style.display = "none";

        // Resize/compress in-browser first — this is what actually
        // controls Supabase egress, not the raw upload cap above.
        let uploadFile;
        try {
          uploadFile = await compressPassportImage(passportFile, {
            maxWidth: 500,
            maxHeight: 500,
            quality: 0.75,
            maxSizeKB: 150
          });
        } catch (compressErr) {
          console.warn("Passport compression failed, uploading original:", compressErr);
          uploadFile = passportFile;
        }

        const fileName = `passport_${Date.now()}.jpg`;

        // Upload to 'passports' bucket
        const { error: uploadError } = await sb.storage
          .from("passports")
          .upload(fileName, uploadFile, {
            cacheControl: "31536000", // filenames are unique per upload, safe to cache for a year
            contentType: "image/jpeg",
            upsert: false
          });

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
        passportPath = fileName; // raw storage path, used for reliable deletes/updates later
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
            batch: batch,
            plan_type: planType,
            read_quran: readQuran,
            attend_online: attendOnline,
            hear_about: hearAbout,
            class_time: classTime,
            reason_arabic: reasonArabic,
            additional: additional,
            passport_url: passportUrl,
            passport_path: passportPath,
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
        access_key: "70f76c51-367f-4e17-a283-b5619e302415",
        subject: "New Student Registration 🎓",
        message: `
A new student just registered:

Name: ${fullName}
Email: ${email}
WhatsApp: ${whatsapp}
Country: ${country}
Level: ${levelArabic}
Plan: ${planType}
Batch: ${batch}
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
  <button id="closeMatricToastBtn" class="success-toast-close" aria-label="Close">
    <i class="fa-solid fa-xmark"></i>
  </button>

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

  function dismissToast() {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }

  // Copy button — copies the matric number, then dismisses (they've got it)
  document.getElementById("copyMatricBtn").onclick = () => {
    navigator.clipboard.writeText(matricNumber).then(() => {
      alert(t("Matric Number copied to clipboard ✅"));
      dismissToast();
    });
  };

  // Explicit close button — no auto-dismiss timer, stays until the user
  // actually acknowledges it (copy or close).
  document.getElementById("closeMatricToastBtn").onclick = dismissToast;
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