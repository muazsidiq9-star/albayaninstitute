console.log("Payment JS loaded");

document.addEventListener('DOMContentLoaded', () => {

  /* ================= HAMBURGER MENU ================= */
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('show'));

    document.addEventListener('click', e => {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        navLinks.classList.remove('show');
      }
    });
  }

  /* ================= SELAR PAYMENT ================= */
  const selarBtn = document.querySelector('.selar-btn');
  if (selarBtn) {
    selarBtn.addEventListener('click', () => {
      window.open('https://selar.com/al-bayan-institute', '_blank');
    });
  }

  /* ================= COPY TO CLIPBOARD ================= */
  window.copyText = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      const toast = document.getElementById('copy-toast');
      if (!toast) return;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    });
  };

  /* ================= SUPABASE ================= */
  const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* ================= CURRENT STUDENT (SOURCE OF TRUTH) ================= */
  function getCurrentStudent() {
    try {
      return JSON.parse(sessionStorage.getItem('currentStudent'));
    } catch (e) {
      return null;
    }
  }

  const currentStudent = getCurrentStudent();
  console.log("Current student:", currentStudent);

  let detectedStudent = null;

  /* ================= LEVEL & PLAN MAPS ================= */

  // Maps any stored variant (English or Arabic) → the exact option value in the <select>
  const LEVEL_MAP = {
    // English (case-insensitive handled below)
    'preliminary'  : 'Preliminary',
    'beginner'     : 'Beginner',
    'intermediate' : 'Intermediate',
    'advanced'     : 'Advanced',
    // Arabic variants — add more here as you discover them in Supabase
    'تمهيدي'       : 'Preliminary',
    'مبتدئ'        : 'Beginner',
    'مبتدئء'       : 'Beginner',
    'مبتديء'       : 'Beginner',
    'متوسط'        : 'Intermediate',
    'متقدم'        : 'Advanced',
  };

  // Maps any stored plan variant → the exact option value in the <select>
  const PLAN_MAP = {
    // English
    'general'  : 'general',
    'private'  : 'private',
    'premium'  : 'private',   // in case DB stores "Premium" instead of "private"
    // Arabic variants
    'عام'      : 'general',
    'خاص'      : 'private',
    'مميز'     : 'private',
  };

  /* ================= HELPERS ================= */

  function resolveFromMap(map, rawValue) {
    if (!rawValue) return null;
    const trimmed = rawValue.trim();
    // Try lowercase first (handles English case differences)
    return map[trimmed.toLowerCase()] || map[trimmed] || null;
  }

  function setLevel(value) {
    const resolved = resolveFromMap(LEVEL_MAP, value);
    console.log("setLevel raw:", value, "→ resolved:", resolved);
    if (!resolved) return;

    const select = document.getElementById('level-arabic');
    for (const option of select.options) {
      if (option.value === resolved) {
        option.selected = true;
        break;
      }
    }
  }

  function setPlan(value) {
    const resolved = resolveFromMap(PLAN_MAP, value);
    console.log("setPlan raw:", value, "→ resolved:", resolved);
    if (!resolved) return;

    const select = document.getElementById('plan-type');
    for (const option of select.options) {
      if (option.value === resolved) {
        option.selected = true;
        break;
      }
    }
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    successMsg.textContent = '';
    successMsg.style.display = 'none';
  }

  function showSuccess(message) {
    successMsg.textContent = message;
    successMsg.style.display = 'block';
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }

  const paymentForm = document.querySelector('.payment-form');
  const successMsg = document.querySelector('.success-msg');
  const errorMsg = document.querySelector('.error-msg');
  const submitBtn = document.querySelector('.submit-btn');

  if (!paymentForm) return;

  successMsg.style.display = 'none';
  errorMsg.style.display = 'none';

  /* ================= AUTO FILL FROM SESSION ================= */
  if (currentStudent) {
    document.getElementById('student-name').value  = currentStudent.fullname || '';
    document.getElementById('student-email').value = currentStudent.email    || '';
    document.getElementById('country').value       = currentStudent.country  || '';

    setPlan(currentStudent.plan_type);
    setLevel(currentStudent.level);
  }

  /* ================= EMAIL LOOKUP ================= */
  const emailInput = document.getElementById('student-email');

  emailInput?.addEventListener('blur', async () => {

    const email = emailInput.value.trim().toLowerCase();
    if (!email) return;

    try {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      detectedStudent = data;

      console.log("Student found — plan_type:", data.plan_type, "| level_arabic:", data.level_arabic);

      document.getElementById('student-name').value = data.fullname || '';
      document.getElementById('country').value      = data.country  || '';

      setPlan(data.plan_type);
      setLevel(data.level_arabic);

      showSuccess(t('Student record found automatically.'));

    } catch (err) {
      console.error("Student lookup failed:", err);
    }
  });

  /* ================= PAYMENT SUBMIT ================= */
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullname   = document.getElementById('student-name').value.trim();
    const email      = document.getElementById('student-email').value.trim();
    const country    = document.getElementById('country')?.value || null;
    const plan_type  = document.getElementById('plan-type')?.value || null;
    const level      = document.getElementById('level-arabic').value;
    const method     = document.getElementById('payment-method').value.trim();
    const amount     = document.getElementById('amount').value;
    const currency   = document.getElementById("currency").value;
    const date       = document.getElementById("payment-date")?.value || null;
    const month      = document.getElementById('month').value;
    const receiptFile = document.getElementById('receipt')?.files[0] || null;

    if (!fullname || !email || !level || !method || !amount || !month) {
      showError(t('Please fill all required fields correctly.'));
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = t('Processing... ⏳');

    try {

      let receipt_url = null;

      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.floor(Math.random() * 100000)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('payment_receipts')
          .upload(fileName, receiptFile);

        if (uploadError) throw uploadError;

        receipt_url = supabase.storage
          .from('payment_receipts')
          .getPublicUrl(fileName).data.publicUrl;
      }

      const insertData = {
        matric_number  : (detectedStudent || currentStudent)?.matric_number || null,
        payer_name     : fullname,
        payer_email    : email,
        country,
        plan_type,
        level_arabic   : level,
        payment_method : method,
        amount         : Number(amount),
        currency,
        payment_date   : date,
        month,
        receipt_url,
        status         : "pending"
      };

      const { error } = await supabase.from("payments").insert([insertData]);
      if (error) throw error;

      /* ================= WEB3FORMS NOTIFICATION ================= */
      try {
        await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_key : "73556940-2533-43e1-8458-aab6b0e894dc",
            subject    : "New Payment Submitted 💰",
            message    : `
Payment received:

Name: ${fullname}
Email: ${email}
Matric: ${(detectedStudent || currentStudent)?.matric_number || "N/A"}
Amount: ${amount} ${currency}
Plan: ${plan_type || "N/A"}
Country: ${country || "N/A"}
Month: ${month}
Payment Method: ${method}
Receipt: ${receipt_url || "No receipt uploaded"}
`
          })
        });
      } catch (emailError) {
        console.error("Web3Forms notification failed:", emailError);
      }

      paymentForm.reset();

      if (currentStudent) {
        document.getElementById('student-name').value  = currentStudent.fullname || '';
        document.getElementById('student-email').value = currentStudent.email    || '';
      }

      showSuccess(t('Payment submitted successfully. We will confirm shortly.'));

    } catch (err) {
      console.error('Payment submission error:', err);
      showError(t('Something went wrong: ') + (err.message || JSON.stringify(err)));

    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

});
