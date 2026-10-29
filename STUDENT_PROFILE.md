# Degree-long student profile

The student profile at `/profile` is the student's own continuing academic record. It is linked from the student sidebar and uses the same user ID through the degree.

Implemented:
- Academic identity: display name, student number, institution, degree, admission and graduation years, and degree stage from first year through graduation.
- About section, learning/career goals, and up to 12 projects with descriptions and validated HTTP/HTTPS links.
- Current learning evidence: curriculum completion, mastered topics, topics to revisit, prediction accuracy and enrolled subjects.
- All-time totals and calendar-year history for assessments, coding, simulations, predictions and algorithm comparisons, including previous subject enrollments.
- Latest 20 activity records across the entire student history, with actual stored dates, scores and outcomes.
- JSON export of the profile, historical aggregates, recent activity and current learning evidence.
- Owner-only authenticated GET/PATCH endpoints at `/api/v1/users/me/student-profile`. Strict request validation, bounded text and project counts, safe links, and no editable scores or permissions.
- Learning evidence no longer expires after 365 days. Transient recommendations still expire. Explicit account deletion clears the new profile fields along with the existing learner records.
- Indexed owner/date queries for the growing activity history.

Product decisions:
- Separate self-reported identity and portfolio from app-recorded learning evidence. Do not present projects as verified achievements.
- Keep lifetime history separate from current mastery: mastery depends on recent evidence and should not be presented as a permanent credential.
- Degree stage is descriptive and does not grant curriculum permissions. Existing registration and enrollment rules remain in force.
- Years in the history table are actual calendar years, not inferred semesters. Institution marks, attendance, CGPA and certificates are not available in the app's current data sources and are not invented.
- The export contains summaries and the latest 20 activities; it is not a raw dump of every attempt or source file.

Possible next iterations: semester enrollment history managed by the department; verified marks imports; project attachments and mentor review; goal milestones; opt-in placement portfolio sharing. These require additional data sources or access rules and are not represented as completed features.

Validation: 75 backend tests passed, including profile validation, owner isolation and retention beyond one year. Browser checks cover profile and editor at 1440/1024/390px, persistence after reload, export and absence of page errors. Existing redesigned routes also passed overflow checks at all three widths.

Local development note: the previous `.data/mongo` directory fails to start MongoDB. Verification used a fresh `.data/mongo-profile` directory; the previous files were preserved.
