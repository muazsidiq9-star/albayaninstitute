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

  /* ================= RECEIPT PREVIEW & CANCEL ================= */
  const receiptInput      = document.getElementById('receipt');
  const receiptLabelText  = document.getElementById('receipt-label-text');
  const previewWrap       = document.getElementById('receipt-preview');      // ← fixed ID
  const previewImg        = document.getElementById('receipt-preview-img');
  const previewName       = document.getElementById('receipt-preview-name'); // ← added
  const receiptCancel     = document.getElementById('receipt-remove');       // ← fixed ID
  let removeExistingReceipt = false;                                         // ← added

  function updateReceiptUI() {
    const file = receiptInput?.files[0];
    if (file && previewWrap && previewImg) {
      if (receiptLabelText) receiptLabelText.textContent = file.name;
      if (previewName) previewName.textContent = file.name;
      previewImg.src = URL.createObjectURL(file);
      previewWrap.style.display = 'block';
    } else {
      if (receiptLabelText) receiptLabelText.textContent = t('Click to choose receipt image');
      if (previewName) previewName.textContent = '';
      if (previewImg) previewImg.src = '';
      if (previewWrap) previewWrap.style.display = 'none';
    }
  }

  receiptInput?.addEventListener('change', () => {
    removeExistingReceipt = false;
    updateReceiptUI();
  });

  receiptCancel?.addEventListener('click', () => {
    if (receiptInput) receiptInput.value = '';
    removeExistingReceipt = true;
    updateReceiptUI();
  });

  const paymentForm = document.querySelector('.payment-form');
  const successMsg = document.querySelector('.success-msg');
  const errorMsg = document.querySelector('.error-msg');
  const submitBtn = document.querySelector('.submit-btn');
  const monthSelect = document.getElementById('month');

  if (!paymentForm) return;

  successMsg.style.display = 'none';
  errorMsg.style.display = 'none';

  /* ================= EXISTING PAYMENT HINT =================
     Lets a student know, before they even upload anything, whether
     they already have a record for the selected month — and whether
     it's still editable (pending) or locked (already confirmed paid). */
  const existingPaymentHint = document.createElement('div');
  existingPaymentHint.className = 'existing-payment-hint';
  existingPaymentHint.style.display = 'none';
  monthSelect?.insertAdjacentElement('afterend', existingPaymentHint);

  const existingReceiptNote = document.createElement('div');
  existingReceiptNote.className = 'existing-payment-hint editable';
  existingReceiptNote.style.display = 'none';
  document.getElementById('receipt')?.insertAdjacentElement('afterend', existingReceiptNote);

  let monthLocked = false;
  let currentMonthPayment = null;

  /* Clears only the month-specific fields (not name/email/country/plan/level,
     which come from the student profile, not the month's payment record) */
  function clearMonthSpecificFields() {
    document.getElementById('payment-method').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('payment-date').value = '';
    existingReceiptNote.style.display = 'none';
    if (receiptInput) receiptInput.value = '';
    removeExistingReceipt = false;
    updateReceiptUI();          // ← hide preview when month has no record
  }

  /* Fills the form with what's already on file for this month so the
     student can see and adjust it, instead of re-typing everything
     (important for part-payment top-ups, where they need to see the
     old amount to know what to change it to) */
  function prefillMonthSpecificFields(existing) {
    document.getElementById('payment-method').value = existing.payment_method || '';
    document.getElementById('amount').value = existing.amount ?? '';
    if (existing.currency) document.getElementById('currency').value = existing.currency;
    document.getElementById('payment-date').value = existing.payment_date ? existing.payment_date.slice(0, 10) : '';

    if (existing.receipt_url && previewWrap && previewImg) {
      // Show existing receipt as thumbnail inside the form
      if (receiptLabelText) receiptLabelText.textContent = t('Current receipt on file');
      if (previewName) previewName.textContent = t('Current receipt on file');
      previewImg.src = existing.receipt_url;
      previewWrap.style.display = 'block';
      existingReceiptNote.textContent = t('A receipt is already on file. Click ❌ to remove it, or choose a new file to replace it.');
      existingReceiptNote.style.display = 'block';
      removeExistingReceipt = false;
    } else {
      existingReceiptNote.style.display = 'none';
      if (receiptInput) receiptInput.value = '';
      removeExistingReceipt = false;
      updateReceiptUI();
    }
  }

  async function checkExistingPaymentForMonth() {
    const month = monthSelect?.value;
    const matric_number = (detectedStudent || currentStudent)?.matric_number;

    if (!month || !matric_number) {
      existingPaymentHint.style.display = 'none';
      monthLocked = false;
      return;
    }

    const { data: existing, error } = await supabase
      .from("payments")
      .select("*")
      .eq("matric_number", matric_number)
      .eq("month", month)
      .maybeSingle();

    if (error || !existing) {
      existingPaymentHint.style.display = 'none';
      monthLocked = false;
      currentMonthPayment = null;
      clearMonthSpecificFields();
      return;
    }

    currentMonthPayment = existing;

    if (existing.status === "paid") {
      existingPaymentHint.textContent = t('This month is already confirmed as paid and can no longer be edited.');
      existingPaymentHint.className = 'existing-payment-hint locked';
      monthLocked = true;
    } else {
      existingPaymentHint.textContent = t("You already have a payment on record for this month. We've filled in what you submitted before — just change whatever needs updating.");
      existingPaymentHint.className = 'existing-payment-hint editable';
      monthLocked = false;
      prefillMonthSpecificFields(existing);
    }
    existingPaymentHint.style.display = 'block';
  }

  monthSelect?.addEventListener('change', checkExistingPaymentForMonth);

  /* ================= AUTO FILL FROM SESSION ================= */
  if (currentStudent) {
    document.getElementById('student-name').value  = currentStudent.fullname || '';
    document.getElementById('student-email').value = currentStudent.email    || '';
    document.getElementById('country').value       = currentStudent.country  || '';

    setPlan(currentStudent.plan_type);
    setLevel(currentStudent.level);
    
    document.getElementById('batch').value         = currentStudent.batch    || '';
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

      document.getElementById('student-name').value = data.fullname || '';
      document.getElementById('country').value      = data.country  || '';

      setPlan(data.plan_type);
      setLevel(data.level_arabic);
      
      document.getElementById('batch').value        = data.batch    || '';

      showSuccess(t('Student record found automatically.'));
      checkExistingPaymentForMonth();

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
    const matric_number = (detectedStudent || currentStudent)?.matric_number || null;

    if (!fullname || !email || !level || !method || !amount || !month) {
      showError(t('Please fill all required fields correctly.'));
      return;
    }

    if (monthLocked) {
      showError(t("This month's payment has already been confirmed and can no longer be edited. Please contact the admin if there's an issue."));
      return;
    }

    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = t('Processing... ⏳');

    try {

      /* Look up whether this student already has a payment on record
         for this exact month. If it's already confirmed "paid", it's
         locked — only the admin can unlock it. If it's "pending", the
         student can still add a missing receipt or top up the amount;
         we update that same row instead of inserting a duplicate. */
      let existingPayment = null;

      if (matric_number) {
        const { data: existing, error: lookupError } = await supabase
          .from("payments")
          .select("*")
          .eq("matric_number", matric_number)
          .eq("month", month)
          .maybeSingle();

        if (lookupError) throw lookupError;
        existingPayment = existing;
      }

      if (existingPayment && existingPayment.status === "paid") {
        showError(t("This month's payment has already been confirmed and can no longer be edited. Please contact the admin if there's an issue."));
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        return;
      }

      // Keep the previous receipt unless the student uploads a new one or clicks ❌
      let receipt_url = existingPayment?.receipt_url || null;

      if (removeExistingReceipt) {
        receipt_url = null;
      }

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

      const paymentData = {
        matric_number,
        payer_name     : fullname,
        payer_email    : email,
        country,
        plan_type,
        level_arabic   : level,
        batch          : (detectedStudent || currentStudent)?.batch || null,
        payment_method : method,
        amount         : Number(amount),
        currency,
        payment_date   : date,
        month,
        receipt_url,
        status         : "pending",
        last_edited_by : email
      };

      let dbError;
      if (existingPayment) {
        ({ error: dbError } = await supabase
          .from("payments")
          .update(paymentData)
          .eq("id", existingPayment.id));
      } else {
        ({ error: dbError } = await supabase.from("payments").insert([paymentData]));
      }
      if (dbError) throw dbError;

      /* ================= WEB3FORMS NOTIFICATION ================= */
      try {
        await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_key : "73556940-2533-43e1-8458-aab6b0e894dc",
            subject    : existingPayment ? "Payment Updated 💰" : "New Payment Submitted 💰",
            message    : `
Payment ${existingPayment ? "updated" : "received"}:

Name: ${fullname}
Email: ${email}
Matric: ${matric_number || "N/A"}
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
      existingPaymentHint.style.display = 'none';
      existingReceiptNote.style.display = 'none';
      currentMonthPayment = null;
      removeExistingReceipt = false;
      updateReceiptUI();               // ← hide preview after submit

      if (currentStudent) {
        document.getElementById('student-name').value  = currentStudent.fullname || '';
        document.getElementById('student-email').value = currentStudent.email    || '';
      }

      showSuccess(existingPayment
        ? t('Payment updated successfully. We will confirm shortly.')
        : t('Payment submitted successfully. We will confirm shortly.')
      );

    } catch (err) {
      console.error('Payment submission error:', err);
      showError(t('Something went wrong: ') + (err.message || JSON.stringify(err)));

    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

});
