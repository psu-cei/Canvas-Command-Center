/* File: assets/js/demo-data.js
 * FICTIONAL sample data shaped like real Canvas API responses, so the dashboard
 * can be tried on GitHub Pages without a proxy or token. No real courses or people.
 */
window.CCC_DEMO = (() => {
  const courses = [
    { id: 900001, name: 'DEMO 101: Introduction to Media Studies', course_code: 'DEMO 101', workflow_state: 'available', start_at: '2026-08-24T04:00:00Z', total_students: null, default_view: 'modules', term: { name: 'Fall 2026 (demo)' } },
    { id: 900002, name: 'DEMO 210: Digital Rhetoric', course_code: 'DEMO 210', workflow_state: 'available', start_at: '2026-08-24T04:00:00Z', default_view: 'wiki', term: { name: 'Fall 2026 (demo)' } },
    { id: 900003, name: 'DEMO SANDBOX: Course Template', course_code: 'DEMO SBX', workflow_state: 'unpublished', start_at: null, default_view: 'modules', term: { name: 'Default Term' } },
  ];

  const mk = (courseId) => {
    const weeks = courseId === 900003 ? 2 : 4;
    const modules = [];
    const pages = [];
    const assignments = [];
    const discussions = [];
    const quizzes = [];
    let itemId = 1;
    for (let w = 1; w <= weeks; w++) {
      const label = (w === 3 && courseId === 900001) ? `Wk ${w}` : `Week ${w}`; // intentional inconsistency for Quick review
      const slug = `week-${w}-overview`;
      pages.push({ page_id: courseId + w, url: slug, title: `${label} Overview`, published: w < weeks, updated_at: '2026-09-1' + w + 'T15:00:00Z', front_page: w === 1,
        body: `<h2>${label} Overview</h2><p>This is fictional demo content for ${label.toLowerCase()}.</p><ul><li>Read the assigned chapter.</li><li>Post in the discussion.</li><li>Submit the short response.</li></ul>` });
      const aId = courseId * 10 + w;
      assignments.push({ id: aId, name: `${label} Response Paper`, points_possible: w === 2 ? 0 : 20, due_at: w === 4 ? null : `2026-09-${String(w * 7).padStart(2, '0')}T03:59:00Z`, published: true, submission_types: ['online_text_entry'] });
      discussions.push({ id: aId + 5000, title: `${label} Discussion`, published: w !== 4, discussion_type: 'threaded', posted_at: '2026-09-01T12:00:00Z', is_announcement: false });
      if (w % 2 === 0) quizzes.push({ id: aId + 7000, title: `${label} Check-in Quiz`, quiz_type: 'assignment', points_possible: 10, question_count: 5, published: w !== 4, due_at: null });
      const items = [
        { id: itemId++, title: `${label} Overview`, type: 'Page', page_url: slug, published: w < weeks },
        { id: itemId++, title: `${label} Discussion`, type: 'Discussion', published: w !== 4 },
        { id: itemId++, title: `${label} Response Paper`, type: 'Assignment', published: true },
      ];
      if (w % 2 === 0) items.push({ id: itemId++, title: `${label} Check-in Quiz`, type: 'Quiz', published: w !== 4 });
      modules.push({ id: courseId + 100 + w, name: label, position: w, published: w !== weeks || courseId === 900002, items_count: items.length, items });
    }
    modules.push({ id: courseId + 199, name: 'Resources (empty)', position: weeks + 1, published: false, items_count: 0, items: [] });
    pages.push({ page_id: courseId + 99, url: 'orphan-notes', title: 'Instructor Notes (not in a module)', published: false, updated_at: '2026-08-20T12:00:00Z', body: '<p>Fictional page that is not linked from any module.</p>' });
    const files = [
      { id: courseId + 1, display_name: 'syllabus-demo.pdf', size: 248311, 'content-type': 'application/pdf', updated_at: '2026-08-18T12:00:00Z', locked: false },
      { id: courseId + 2, display_name: 'week1-slides-demo.pptx', size: 3411200, 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', updated_at: '2026-08-25T12:00:00Z', locked: false },
    ];
    return { modules, pages, assignments, discussions, quizzes, files };
  };

  const byCourse = Object.fromEntries(courses.map((c) => [c.id, mk(c.id)]));
  return { self: { id: 1, name: 'Demo Instructor' }, courses, byCourse };
})();
