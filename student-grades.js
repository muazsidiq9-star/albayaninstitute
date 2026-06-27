const db = sb; // reuse the SAME supabase client from HTML

const gradesBody   = document.getElementById("gradesBody");
const searchInput  = document.getElementById("gradesSearch");
const filterSelect = document.getElementById("gradesFilter");

let allGrades = [];

/* --------------------------------
   STUDENT GUARD
--------------------------------- */
(function () {
  const role  = sessionStorage.getItem("role");
  const matric = sessionStorage.getItem("matric");
  if (role !== "student" || !matric) {
    alert("Student login required");
    window.location.href = "login.html";
  }
})();

/* --------------------------------
   LOAD GRADES (ONLY RELEASED)
--------------------------------- */
async function loadStudentGrades() {
  try {
    const matric = sessionStorage.getItem("matric");
    const { data, error } = await db
      .from("grades")
      .select("matric_number, level_arabic, course, semester, assessment_score, exam_score, total_score, remark, status")
      .eq("matric_number", matric)
      .eq("released", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    allGrades = data || [];
    renderGrades(allGrades);
  } catch (err) {
    console.error("Load grades error:", err);
  }
}

/* --------------------------------
   RENDER TABLE
--------------------------------- */
function renderGrades(grades) {
  gradesBody.innerHTML = "";

  if (grades.length === 0) {
    gradesBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:28px; color:var(--text-muted);">
          ${t("No grades found")}
        </td>
      </tr>`;
    return;
  }

  grades.forEach(g => {
    const status = (g.status || "").toLowerCase();
    gradesBody.innerHTML += `
      <tr>
        <td>${g.matric_number || "--"}</td>
        <td>${g.level_arabic  || "--"}</td>
        <td>${g.course        || "--"}</td>
        <td>${g.semester      || "--"}</td>
        <td>${g.assessment_score ?? "--"}</td>
        <td>${g.exam_score    ?? "--"}</td>
        <td>${g.total_score !== undefined ? g.total_score + "%" : "--"}</td>
        <td>${g.remark        || "--"}</td>
        <td><span class="sg-badge ${status}">${translateStatus(g.status)}</span></td>
      </tr>`;
  });
}

function translateStatus(status) {
  if (!status) return "--";
  const map = { pass: t("Pass"), average: t("Average"), fail: t("Fail") };
  return map[status.toLowerCase()] || status;
}

/* --------------------------------
   SEARCH & FILTER
--------------------------------- */
function applyFilters() {
  const text   = searchInput.value.toLowerCase();
  const filter = filterSelect.value;

  let filtered = allGrades.filter(g =>
    (g.course || "").toLowerCase().includes(text)
  );

  if (filter !== "all") {
    filtered = filtered.filter(g =>
      (g.status || "").toLowerCase() === filter
    );
  }

  renderGrades(filtered);
}

searchInput.addEventListener("input",  applyFilters);
filterSelect.addEventListener("change", applyFilters);

/* ── Shared layout helpers (same ones used by the receipt PDF) ── */
function pdfDrawHRule(doc, y, leftX, rightX, color = [180, 151, 42]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.line(leftX, y, rightX, y);
}

function pdfDrawDoubleRule(doc, y, leftX, rightX) {
  doc.setDrawColor(180, 151, 42);
  doc.setLineWidth(1.2);
  doc.line(leftX, y, rightX, y);
  doc.setLineWidth(0.4);
  doc.line(leftX, y + 4, rightX, y + 4);
}

function pdfLabel(doc, text, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(text.toUpperCase(), x, y);
}

function pdfValue(doc, text, x, y, maxWidth) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  if (maxWidth) {
    doc.text(text, x, y, { maxWidth });
  } else {
    doc.text(text, x, y);
  }
}

/* ── Page chrome: border, corner ornaments, watermark, top & bottom bands ──
   withWatermark is turned off on repeated/continuation pages so the diagonal
   text never gets drawn over the grades table. ── */
function drawGradesPageChrome(doc, pw, ph, ML, MR, withWatermark = true) {
  // outer green border
  doc.setDrawColor(21, 128, 61);          // --primary-dark
  doc.setLineWidth(2.5);
  doc.roundedRect(16, 16, pw - 32, ph - 32, 4, 4, "S");

  // inner gold border
  doc.setDrawColor(180, 151, 42);
  doc.setLineWidth(0.7);
  doc.roundedRect(22, 22, pw - 44, ph - 44, 3, 3, "S");

  // corner ornaments
  const co = 18;
  [[34, 34], [pw - 34 - co, 34], [34, ph - 34 - co], [pw - 34 - co, ph - 34 - co]].forEach(([cx, cy]) => {
    doc.setDrawColor(180, 151, 42);
    doc.setLineWidth(0.6);
    doc.line(cx, cy, cx + co, cy);
    doc.line(cx, cy, cx, cy + co);
  });

  // watermark (page 1 only — see note above)
  if (withWatermark) {
    doc.setTextColor(230, 230, 230);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    for (let wy = 60; wy < ph - 30; wy += 44) {
      for (let wx = 40; wx < pw; wx += 110) {
        doc.text("Al-Bayan", wx, wy, { angle: 45 });
      }
    }
  }

  // top band
  doc.setFillColor(21, 128, 61);          // --primary-dark
  doc.rect(28, 28, pw - 56, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("OFFICE OF THE H. O. D", ML, 48);
  doc.text("OFFICIAL ACADEMIC REPORT", MR, 48, { align: "right" });

  pdfDrawHRule(doc, 62, ML, MR);

  // bottom band
  doc.setFillColor(21, 128, 61);          // --primary-dark
  doc.rect(28, ph - 60, pw - 56, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.text(
    "This is a computer-generated report  ·  Any alteration renders it invalid  ·  Verify via QR code",
    pw / 2, ph - 42, { align: "center" }
  );
}

/* --------------------------------
   DOWNLOAD PDF
--------------------------------- */
async function downloadGradesPDF() {
  try {
    const matric = sessionStorage.getItem("matric");

    const { data: grades, error } = await sb
      .from("grades")
      .select("matric_number, level_arabic, course, semester, assessment_score, exam_score, total_score, remark, status")
      .eq("matric_number", matric);

    if (error) throw error;
    if (!grades || grades.length === 0) { alert(t("No grades to download.")); return; }

    const { data: student, error: studentErr } = await sb
      .from("students").select("fullname").eq("matric_number", matric).single();
    if (studentErr) throw studentErr;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ML = 48;
    const MR = pw - 48;

    const reportId   = `GR-${matric}-${Date.now().toString().slice(-6)}`;
    const dateIssued  = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const semester    = grades[0]?.semester || "-";

    /* ── PAGE 1 CHROME (includes watermark) ── */
    drawGradesPageChrome(doc, pw, ph, ML, MR, true);

    /* ── LOGO ── */
    let logoBottomY = 100;
    const logo = new Image();
    logo.src = "logo.png";
    await new Promise(resolve => {
      logo.onload = () => {
        const lw = 54;
        const lh = (logo.height / logo.width) * lw;
        doc.addImage(logo, "PNG", pw / 2 - lw / 2, 68, lw, lh);
        logoBottomY = 68 + lh + 6;
        resolve();
      };
      logo.onerror = resolve;
    });

    /* ── INSTITUTION NAME ── */
    doc.setTextColor(21, 128, 61);        // --primary-dark
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const instName = "Darul Abrār International Institute";
    const instW = doc.getTextWidth(instName);
    const maxInstW = MR - ML;
    if (instW > maxInstW) doc.setFontSize(13 * (maxInstW / instW));
    doc.text(instName, pw / 2, logoBottomY + 14, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(21, 128, 61);        // --primary-dark
    doc.text("Office of the H. O. D  -  Academic Records Division", pw / 2, logoBottomY + 28, { align: "center" });

    /* ── DOUBLE RULE ── */
    const ornY = logoBottomY + 40;
    pdfDrawDoubleRule(doc, ornY, ML, MR);

    /* ── REPORT TITLE ── */
    doc.setTextColor(21, 128, 61);        // --primary-dark
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("ACADEMIC GRADES REPORT", pw / 2, ornY + 22, { align: "center" });

    /* ── DOC META BAND ── */
    const metaY = ornY + 34;
    doc.setFillColor(253, 246, 224);
    doc.rect(ML, metaY, MR - ML, 28, "F");
    doc.setDrawColor(212, 200, 154);
    doc.setLineWidth(0.5);
    doc.rect(ML, metaY, MR - ML, 28, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 80, 20);
    doc.text("REPORT ID", ML + 8, metaY + 10);
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    doc.text(reportId, ML + 8, metaY + 22);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(100, 80, 20);
    doc.text("DATE ISSUED", MR - 8, metaY + 10, { align: "right" });
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    doc.text(dateIssued, MR - 8, metaY + 22, { align: "right" });

    /* ── STUDENT PARTICULARS ── */
    const spY = metaY + 46;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(180, 151, 42);
    doc.text("STUDENT PARTICULARS", ML, spY);
    pdfDrawHRule(doc, spY + 5, ML, MR, [212, 200, 154]);

    const col1X = ML;
    const col2X = pw / 2 + 10;
    let gy = spY + 20;
    const rowH = 30;

    pdfLabel(doc, "Full Name", col1X, gy);
    pdfValue(doc, student.fullname, col1X, gy + 12, pw / 2 - ML - 20);
    pdfLabel(doc, "Matric Number", col2X, gy);
    pdfValue(doc, matric, col2X, gy + 12, pw / 2 - 30);
    gy += rowH;

    pdfLabel(doc, "Level", col1X, gy);
    pdfValue(doc, grades[0]?.level_arabic || "-", col1X, gy + 12);
    pdfLabel(doc, "Semester", col2X, gy);
    pdfValue(doc, semester, col2X, gy + 12);
    gy += rowH;

    /* ── ACADEMIC PERFORMANCE LABEL ── */
    const tableLabelY = gy + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(180, 151, 42);
    doc.text("ACADEMIC PERFORMANCE", ML, tableLabelY);
    pdfDrawHRule(doc, tableLabelY + 5, ML, MR, [212, 200, 154]);

    const tableStartY = tableLabelY + 20;

    /* ── GRADES TABLE ── */
    let totalSum = 0;
    const tableData = grades.map(g => {
      totalSum += Number(g.total_score) || 0;
      return [
        g.level_arabic || "-",
        g.course || "-",
        g.assessment_score ?? "-",
        g.exam_score ?? "-",
        g.total_score !== undefined ? Number(g.total_score).toFixed(2) + "%" : "-",
        g.remark || "-",
        g.status === "completed" ? "Done" : (g.status || "-")
      ];
    });

    doc.autoTable({
      startY: tableStartY,
      margin: { left: ML, right: pw - MR, top: 96, bottom: 76 },
      head: [["Level", "Course", "Assess.", "Exam", "Total", "Remark", "Status"]],
      body: tableData,
      styles: {
        fontSize: 8.5, cellPadding: 5, valign: "middle", halign: "center",
        overflow: "linebreak", lineColor: [212, 200, 154], lineWidth: 0.5
      },
      headStyles: { fillColor: [21, 128, 61], textColor: 255, halign: "center", fontStyle: "bold" }, // --primary-dark
      alternateRowStyles: { fillColor: [240, 253, 244] },                                              // --primary-xlight
      columnStyles: {
        0: { cellWidth: 44 }, 1: { cellWidth: 150, halign: "left" }, 2: { cellWidth: 50 },
        3: { cellWidth: 44 }, 4: { cellWidth: 50 }, 5: { cellWidth: 74, halign: "left" }, 6: { cellWidth: 50 }
      },
      didDrawPage: function () {
        // redraws border / corner ornaments / top+bottom bands on every page,
        // including page 1 (harmless redraw) — watermark stays off here.
        drawGradesPageChrome(doc, pw, ph, ML, MR, false);
      }
    });

    /* ── RESULTS SUMMARY (page-break aware) ── */
    let finalY = doc.lastAutoTable.finalY + 24;
    const neededHeight = 300;

    if (finalY + neededHeight > ph - 76) {
      doc.addPage();
      drawGradesPageChrome(doc, pw, ph, ML, MR, false);
      finalY = 96;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(180, 151, 42);
    doc.text("RESULTS SUMMARY", ML, finalY);
    pdfDrawHRule(doc, finalY + 5, ML, MR, [212, 200, 154]);

    /* Summary box */
    const amtY = finalY + 36;
    doc.setFillColor(240, 253, 244);      // --primary-xlight
    doc.roundedRect(ML, amtY - 16, MR - ML, 38, 3, 3, "F");
    doc.setDrawColor(209, 250, 229);      // --border-light
    doc.setLineWidth(0.5);
    doc.roundedRect(ML, amtY - 16, MR - ML, 38, 3, 3, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(21, 128, 61);        // --primary-dark
    doc.text("TOTAL SCORE SUM", ML + 12, amtY - 4);
    doc.setFontSize(22);
    doc.text(`${totalSum.toFixed(2)}%`, ML + 12, amtY + 16);

    /* Overall standing badge */
    const avgScore = totalSum / grades.length;
    const standing = avgScore >= 70 ? "EXCELLENT" : avgScore >= 50 ? "GOOD" : "REVIEW NEEDED";
    const standingColor = avgScore >= 70 ? [21, 128, 61] : avgScore >= 50 ? [146, 64, 14] : [185, 28, 28];
    doc.setFillColor(...standingColor);
    doc.roundedRect(MR - 100, amtY - 10, 92, 20, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(standing, MR - 54, amtY + 4, { align: "center" });

    /* Stat row */
    let detY = amtY + 42;
    pdfLabel(doc, "Average Score", ML, detY);
    pdfValue(doc, `${avgScore.toFixed(2)}%`, ML, detY + 12);
    pdfLabel(doc, "Total Courses", pw / 2 + 10, detY);
    pdfValue(doc, String(grades.length), pw / 2 + 10, detY + 12);

    /* ── CLOSING MESSAGE ── */
    const msgY = detY + 46;
    pdfDrawHRule(doc, msgY, ML, MR, [212, 200, 154]);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(40, 40, 40);
    doc.text(
      "This report reflects all grades currently released for the student named above as at the date of issue.\n" +
      "May Allah grant you success in your studies and increase you in beneficial knowledge.",
      pw / 2, msgY + 18,
      { align: "center", maxWidth: MR - ML }
    );

    /* ── SIGNATURE + QR ── */
    const sigY = msgY + 70;

    const sign = new Image(); sign.src = "sign.png";
    await new Promise(resolve => {
      sign.onload  = () => { doc.addImage(sign, "PNG", ML, sigY, 150, 56); resolve(); };
      sign.onerror = resolve;
    });

    pdfDrawHRule(doc, sigY + 62, ML, ML + 160, [100, 100, 100]);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(21, 128, 61);        // --primary-dark
    doc.text("Ustadh Muhammad Hassan", ML, sigY + 76);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text("H.O.D, Al-Bayan Arabic Institute", ML, sigY + 90);

    /* QR */
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, `${matric}|${reportId}|${totalSum.toFixed(2)}|${student.fullname}`, { width: 80 });
    doc.addImage(qrCanvas.toDataURL("image/png"), "PNG", MR - 84, sigY, 72, 72);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text("Scan to verify", MR - 48, sigY + 82, { align: "center" });

    doc.save(`Grades_${matric}.pdf`);

  } catch (err) {
    console.error("PDF download error:", err);
    alert(t("Error downloading PDF. See console for details."));
  }
}

/* --------------------------------
   INIT
--------------------------------- */
document.addEventListener("DOMContentLoaded", loadStudentGrades);