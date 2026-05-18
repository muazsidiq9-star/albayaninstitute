document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("gradesForm");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const student = document.getElementById("gradeStudent").value.trim();
    const course = document.getElementById("gradeCourse").value.trim();
    const assessment = Number(document.getElementById("gradeAssessment").value);
    const exams = Number(document.getElementById("gradeExams").value);

    const total = assessment + exams;

    let status = "Fail";
    if (total >= 70) status = "Pass";
    else if (total >= 50) status = "Average";

    const grade = {
      student,
      course,
      assessment,
      exams,
      total,
      status
    };

    const gradesData = JSON.parse(localStorage.getItem("gradesDataArray")) || [];
    gradesData.push(grade);
    localStorage.setItem("gradesDataArray", JSON.stringify(gradesData));

    alert("Grade saved successfully!");
    form.reset();
  });
});