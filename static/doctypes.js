// Document type metadata + form field schema + content builder.
// Ported 1:1 in spirit from the original DocuAI React app's buildContent()/DocumentFields().

const TYPE_LABELS = {
  resume: 'Resume',
  cv: 'Curriculum Vitae',
  'cover-letter': 'Cover Letter',
  'application-letter': 'Application Letter',
  'scholarship-letter': 'Scholarship Letter',
  'internship-letter': 'Internship Letter',
  'resignation-letter': 'Resignation Letter',
  other: 'Other Document',
};

const TYPE_ICONS = {
  resume: 'file-text',
  cv: 'clipboard',
  'cover-letter': 'heart',
  'application-letter': 'pen',
  'scholarship-letter': 'cap',
  'internship-letter': 'archive',
  'resignation-letter': 'send',
  other: 'file-text',
};

const DOCUMENT_CHOICES = [
  { value: 'resume', label: 'Resume' },
  { value: 'cv', label: 'Curriculum Vitae' },
  { value: 'cover-letter', label: 'Cover Letter' },
  { value: 'application-letter', label: 'Application Letter' },
  { value: 'scholarship-letter', label: 'Scholarship Letter' },
  { value: 'internship-letter', label: 'Internship Letter' },
  { value: 'resignation-letter', label: 'Resignation Letter' },
  { value: 'other', label: 'Other Document' },
];

// Field shorthand: [key, label, wide?, textarea?]
function F(key, label, wide, textarea) {
  return { key, label, wide: !!wide, textarea: !!textarea };
}

const COMMON_FIELDS = [
  F('links', 'Professional links (LinkedIn / portfolio / GitHub)', true),
  F('targetRole', 'Target job position'),
  F('industry', 'Preferred industry'),
  F('careerObjective', 'Career objective / professional summary', true, true),
];

const EDUCATION_FIELDS = [
  F('school', 'School / university'),
  F('degree', 'Degree / program'),
  F('major', 'Major / specialization'),
  F('educationLocation', 'Education location'),
  F('educationDates', 'Start year – end year'),
  F('honors', 'Honors / academic awards'),
  F('coursework', 'Relevant coursework', true, true),
];

const EXPERIENCE_FIELDS = [
  F('jobTitle', 'Job title'),
  F('company', 'Company / organization'),
  F('experienceLocation', 'Experience location'),
  F('experienceDates', 'Start date – end date'),
  F('responsibilities', 'Responsibilities', true, true),
  F('achievements', 'Achievements', true, true),
  F('quantifiedResults', 'Quantifiable results', true, true),
];

const SKILLS_FIELDS = [
  F('technicalSkills', 'Technical skills', true, true),
  F('softSkills', 'Soft skills'),
  F('tools', 'Tools / software'),
  F('programmingLanguages', 'Programming languages'),
  F('spokenLanguages', 'Languages spoken'),
  F('projects', 'Projects', true, true),
  F('certifications', 'Certifications'),
  F('training', 'Training'),
  F('volunteer', 'Volunteer experience'),
  F('leadership', 'Leadership experience'),
  F('organizations', 'Organizations / memberships'),
  F('references', 'References (optional)', true, true),
];

const PHOTO_FIELD = { key: 'photoData', label: 'Optional profile picture', photo: true, wide: true };

const FIELDS_BY_TYPE = {
  resume: [
    ...COMMON_FIELDS,
    F('yearsExperience', 'Years of experience'),
    ...EDUCATION_FIELDS,
    ...EXPERIENCE_FIELDS,
    ...SKILLS_FIELDS,
    PHOTO_FIELD,
    F('details', 'Additional information', true, true),
  ],
  cv: [
    ...COMMON_FIELDS,
    ...EDUCATION_FIELDS,
    ...EXPERIENCE_FIELDS,
    F('researchInterests', 'Research interests', true, true),
    F('researchExperience', 'Research experience', true, true),
    F('researchProjects', 'Research projects', true, true),
    F('publications', 'Publications', true, true),
    F('conferences', 'Conferences'),
    F('presentations', 'Presentations'),
    F('thesis', 'Thesis / dissertation', true, true),
    F('grants', 'Grants / fellowships'),
    F('teaching', 'Teaching experience', true, true),
    F('professionalMemberships', 'Professional memberships'),
    F('achievements', 'Academic achievements', true, true),
    ...SKILLS_FIELDS,
    PHOTO_FIELD,
  ],
  'cover-letter': [
    F('targetRole', 'Position applied for'),
    F('organization', 'Company name'),
    F('companyAddress', 'Company address'),
    F('recipient', 'Hiring manager / recipient'),
    F('jobReference', 'Job posting / reference number'),
    F('jobSource', 'Where you found the job'),
    F('currentStatus', 'Current position / student status'),
    F('relevantEducation', 'Relevant education', true, true),
    F('experience', 'Relevant experience', true, true),
    F('relevantSkills', 'Most relevant skills', true, true),
    F('majorAchievement', 'Major achievement', true, true),
    F('whyCompany', 'Why this company?', true, true),
    F('whyPosition', 'Why this position?', true, true),
    F('contribution', 'What can you contribute?', true, true),
    F('fit', 'Why are you a good fit?', true, true),
    F('jobDescription', 'Job description', true, true),
    F('availability', 'Availability'),
    F('details', 'Additional context', true, true),
  ],
  'application-letter': [
    F('documentPurpose', 'What are you applying for?', true),
    F('targetRole', 'Position / program name'),
    F('recipient', 'Recipient name and title'),
    F('organization', 'Organization'),
    F('jobReference', 'Reference number'),
    F('education', 'Educational background', true, true),
    F('experience', 'Work experience', true, true),
    F('relevantSkills', 'Relevant skills', true, true),
    F('achievements', 'Achievements', true, true),
    F('certifications', 'Certifications / training'),
    F('motivation', 'Why are you applying?', true, true),
    F('contribution', 'What do you hope to contribute?', true, true),
    F('details', 'Projects, leadership, volunteer work', true, true),
    F('availability', 'Availability'),
  ],
  'scholarship-letter': [
    F('targetRole', 'Scholarship name'),
    F('scholarshipProvider', 'Scholarship provider'),
    F('deadline', 'Deadline'),
    F('institution', 'School / university'),
    F('degree', 'Program / course'),
    F('currentStatus', 'Year level'),
    F('gpa', 'GPA / grades'),
    F('achievements', 'Academic honors and achievements', true, true),
    F('projects', 'Relevant projects', true, true),
    F('motivation', 'Why are you seeking this scholarship?', true, true),
    F('financialNeed', 'Financial need (optional)', true, true),
    F('circumstances', 'Family / financial circumstances (optional)', true, true),
    F('otherSupport', 'Other financial support (optional)'),
    F('expenses', 'Educational expenses (optional)'),
    F('challenges', 'Challenges / obstacles', true, true),
    F('communityInvolvement', 'Community involvement and leadership', true, true),
    F('goals', 'Career and educational goals', true, true),
    F('useOfEducation', 'How the scholarship will help', true, true),
    F('communityImpact', 'Future contribution to community / society', true, true),
    F('requirements', 'Scholarship requirements and criteria', true, true),
  ],
  'internship-letter': [
    F('targetRole', 'Internship position'),
    F('organization', 'Company / organization'),
    F('department', 'Department'),
    F('internshipDuration', 'Internship duration'),
    F('requiredHours', 'Required hours'),
    F('startDate', 'Start date'),
    F('endDate', 'End date'),
    F('requiredInternship', 'Required internship / practicum', true, true),
    F('institution', 'School / university'),
    F('degree', 'Program / course'),
    F('currentStatus', 'Year level / student status'),
    F('coursework', 'Relevant coursework', true, true),
    F('projects', 'Projects and previous experience', true, true),
    F('skills', 'Skills and tools', true, true),
    F('motivation', 'Why this company and internship?', true, true),
    F('learningGoals', 'What do you want to learn?', true, true),
    F('contribution', 'What can you contribute?', true, true),
    F('supportingDocuments', 'Supporting documents', true, true),
  ],
  'resignation-letter': [
    F('targetRole', 'Your current position'),
    F('organization', 'Company / organization'),
    F('department', 'Department'),
    F('recipient', 'Supervisor / HR recipient'),
    F('letterDate', 'Date of letter'),
    F('lastWorkingDay', 'Last working day'),
    F('noticePeriod', 'Notice period'),
    F('resignationReason', 'Reason for leaving (optional)', true, true),
    F('gratitude', 'What you are grateful for', true, true),
    F('transitionPlan', 'Transition and handover plan', true, true),
    F('companyProperty', 'Company property to return'),
    F('forwardingContact', 'Personal contact after you leave'),
    F('details', 'Additional notes', true, true),
  ],
  other: [
    F('documentPurpose', 'Document purpose', true),
    F('recipient', 'Audience or recipient'),
    F('tone', 'Preferred tone'),
    F('details', 'Background or key information', true, true),
    F('experience', 'Supporting experience or context', true, true),
    F('goals', 'Goals', true, true),
    F('supportingDocuments', 'Supporting documents', true, true),
  ],
};

function emptyForm() {
  const form = { name: '', email: '', phone: '', location: '' };
  Object.values(FIELDS_BY_TYPE).forEach((fields) => {
    fields.forEach((f) => { form[f.key] = form[f.key] || ''; });
  });
  return form;
}

function hasMeaningfulFormData(form) {
  return Object.entries(form).some(([key, value]) => key !== 'name' && key !== 'photoData' && String(value || '').trim());
}

// --- content builder (mirrors buildContent() in the original app) --------
function block(label, value) {
  const v = (value || '').trim();
  return v ? `${label}\n${v}` : '';
}
function join(...parts) {
  return parts.filter(Boolean).join('\n');
}
function pick(...values) {
  return values.find((v) => v && String(v).trim()) || '';
}

function buildContent(type, form) {
  const role = (form.targetRole || '').trim();
  let parts = [];

  if (type === 'resume') {
    parts = [
      block('TARGET ROLE', role),
      block('PROFESSIONAL SUMMARY', pick(form.careerObjective, form.details)),
      block('INDUSTRY', form.industry),
      block('EXPERIENCE', form.experience),
      block('RESPONSIBILITIES', form.responsibilities),
      block('QUANTIFIABLE RESULTS', form.quantifiedResults),
      block('EDUCATION', pick(form.education, [form.school, form.degree, form.major, form.educationDates].filter(Boolean).join(' · '))),
      block('TECHNICAL SKILLS', pick(form.technicalSkills, form.skills)),
      block('SOFT SKILLS', form.softSkills),
      block('TOOLS AND SOFTWARE', form.tools),
      block('PROGRAMMING LANGUAGES', form.programmingLanguages),
      block('LANGUAGES', form.spokenLanguages),
      block('PROJECTS', form.projects),
      block('CERTIFICATIONS AND TRAINING', join(form.certifications, form.training)),
      block('AWARDS AND ACHIEVEMENTS', form.achievements),
      block('VOLUNTEER AND LEADERSHIP', join(form.volunteer, form.leadership)),
      block('ORGANIZATIONS', form.organizations),
      block('REFERENCES', form.references),
    ];
  } else if (type === 'cv') {
    parts = [
      block('PROFESSIONAL PROFILE', pick(form.careerObjective, form.details)),
      block('CAREER OBJECTIVE', form.goals),
      block('RESEARCH INTERESTS', form.researchInterests),
      block('EDUCATION', pick(form.education, [form.school, form.degree, form.major, form.educationDates, form.honors].filter(Boolean).join(' · '))),
      block('PROFESSIONAL EXPERIENCE', form.experience),
      block('RESEARCH EXPERIENCE', form.researchExperience),
      block('RESEARCH PROJECTS', form.researchProjects),
      block('PUBLICATIONS', form.publications),
      block('CONFERENCES AND PRESENTATIONS', join(form.conferences, form.presentations)),
      block('THESIS OR DISSERTATION', pick(form.thesis, form.dissertation)),
      block('ACADEMIC ACHIEVEMENTS', pick(form.achievements, form.honors)),
      block('GRANTS, FELLOWSHIPS, AND AWARDS', form.grants),
      block('TECHNICAL AND RESEARCH SKILLS', join(form.technicalSkills, form.skills)),
      block('SOFTWARE AND LANGUAGES', join(form.tools, form.spokenLanguages)),
      block('TEACHING EXPERIENCE', form.teaching),
      block('CERTIFICATIONS AND TRAINING', join(form.certifications, form.training)),
      block('VOLUNTEER WORK AND ORGANIZATIONS', join(form.volunteer, form.organizations, form.professionalMemberships)),
      block('REFERENCES', form.references),
    ];
  } else if (type === 'cover-letter') {
    const greeting = `Dear ${(form.recipient || form.hiringManager || 'Hiring Manager').trim() || 'Hiring Manager'},`;
    parts = [
      block('RE', role),
      block('COMPANY', pick(form.organization, form.company)),
      block('COMPANY ADDRESS', form.companyAddress),
      block('JOB REFERENCE', form.jobReference),
      greeting,
      block('HOW I FOUND THIS ROLE', form.jobSource),
      block('WHY THIS COMPANY', pick(form.whyCompany, form.motivation)),
      block('WHY THIS POSITION', form.whyPosition),
      block('RELEVANT BACKGROUND', [form.currentStatus, pick(form.relevantEducation, form.education), pick(form.relevantSkills, form.skills)].filter(Boolean).join('\n')),
      block('RELEVANT EXPERIENCE', form.experience),
      block('MAJOR ACHIEVEMENT', pick(form.majorAchievement, form.achievements)),
      block('WHAT I CAN CONTRIBUTE', form.contribution),
      block('WHY I AM A GOOD FIT', form.fit),
      block('JOB DESCRIPTION AND MATCHING NOTES', form.jobDescription),
      block('AVAILABILITY', form.availability),
      'Thank you for your consideration.', 'Sincerely,', (form.name || '').trim(),
    ];
  } else if (type === 'application-letter') {
    parts = [
      block('APPLICATION FOR', pick(role, form.documentPurpose)),
      block('RECIPIENT', form.recipient),
      block('ORGANIZATION', form.organization),
      block('REFERENCE NUMBER', form.jobReference),
      block('EDUCATIONAL BACKGROUND', form.education),
      block('WORK EXPERIENCE', form.experience),
      block('RELEVANT SKILLS', pick(form.relevantSkills, form.skills)),
      block('ACHIEVEMENTS', form.achievements),
      block('CERTIFICATIONS AND TRAINING', join(form.certifications, form.training)),
      block('WHY I AM APPLYING', form.motivation),
      block('WHAT I HOPE TO CONTRIBUTE', form.contribution),
      block('SUPPORTING EXPERIENCE', [form.projects, form.leadership, form.volunteer, form.details].filter(Boolean).join('\n')),
      block('AVAILABILITY', form.availability),
      'Thank you for considering my application.', 'Sincerely,', (form.name || '').trim(),
    ];
  } else if (type === 'scholarship-letter') {
    parts = [
      block('SCHOLARSHIP', role),
      block('PROVIDER', form.scholarshipProvider),
      block('DEADLINE', form.deadline),
      block('SCHOOL AND PROGRAM', [pick(form.institution, form.school), form.degree, form.major].filter(Boolean).join(' · ')),
      block('ACADEMIC PROFILE', [form.gpa, form.honors, form.education].filter(Boolean).join('\n')),
      block('ACADEMIC ACHIEVEMENTS AND PROJECTS', join(form.achievements, form.projects)),
      block('REASON FOR APPLYING', form.motivation),
      block('FINANCIAL NEED', [form.financialNeed, form.circumstances, form.otherSupport, form.expenses].filter(Boolean).join('\n')),
      block('CHALLENGES AND COMMUNITY INVOLVEMENT', [form.challenges, form.communityInvolvement, form.volunteer, form.extracurricular].filter(Boolean).join('\n')),
      block('EDUCATIONAL AND CAREER GOALS', join(form.goals, form.useOfEducation)),
      block('FUTURE CONTRIBUTION', form.communityImpact),
      block('SCHOLARSHIP REQUIREMENTS AND CRITERIA', join(form.requirements, form.criteria)),
      'Dear Scholarship Committee,', 'Thank you for considering my application.', 'Sincerely,', (form.name || '').trim(),
    ];
  } else if (type === 'internship-letter') {
    parts = [
      block('INTERNSHIP POSITION', role),
      block('COMPANY OR ORGANIZATION', pick(form.organization, form.company)),
      block('DEPARTMENT', form.department),
      block('INTERNSHIP DURATION', form.internshipDuration),
      block('DATES AND REQUIRED HOURS', [form.startDate, form.endDate, form.requiredHours].filter(Boolean).join(' · ')),
      block('REQUIRED INTERNSHIP OR PRACTICUM', form.requiredInternship),
      block('STUDENT BACKGROUND', [pick(form.institution, form.school), form.degree, form.major, form.currentStatus].filter(Boolean).join(' · ')),
      block('RELEVANT COURSEWORK', form.coursework),
      block('PROJECTS AND EXPERIENCE', [form.projects, form.experience, form.previousInternship].filter(Boolean).join('\n')),
      block('SKILLS', [form.technicalSkills, form.tools, form.softSkills, form.skills].filter(Boolean).join('\n')),
      block('WHY THIS COMPANY AND INTERNSHIP', join(form.whyCompany, form.motivation)),
      block('LEARNING GOALS AND CONTRIBUTION', [form.learningGoals, form.contribution, form.goals].filter(Boolean).join('\n')),
      block('SUPPORTING DOCUMENTS', form.supportingDocuments),
      'Dear Hiring Team,', 'Thank you for your consideration.', 'Sincerely,', (form.name || '').trim(),
    ];
  } else if (type === 'resignation-letter') {
    const greeting = `Dear ${(form.recipient || 'Sir or Madam').trim() || 'Sir or Madam'},`;
    parts = [
      block('DATE', form.letterDate),
      block('COMPANY', pick(form.organization, form.company)),
      block('DEPARTMENT', form.department),
      block('RE', role ? `Resignation from the position of ${role}` : 'Resignation'),
      greeting,
      block('NOTICE OF RESIGNATION', [`Please accept this letter as formal notice of my resignation${role ? ` from my position as ${role}` : ''}.`, form.lastWorkingDay ? `My last working day will be ${form.lastWorkingDay}.` : '', form.noticePeriod ? `This follows a notice period of ${form.noticePeriod}.` : ''].filter(Boolean).join(' ')),
      block('REASON FOR LEAVING', form.resignationReason),
      block('GRATITUDE', form.gratitude),
      block('TRANSITION PLAN', form.transitionPlan),
      block('COMPANY PROPERTY', form.companyProperty),
      block('STAYING IN TOUCH', form.forwardingContact),
      block('ADDITIONAL NOTES', form.details),
      'Thank you for the opportunities and support during my time here.', 'Sincerely,', (form.name || '').trim(),
    ];
  } else {
    parts = [
      block('PURPOSE', form.documentPurpose),
      block('AUDIENCE OR RECIPIENT', form.recipient),
      block('TONE', form.tone),
      block('BACKGROUND AND KEY INFORMATION', form.details),
      block('EXPERIENCE AND SUPPORTING CONTEXT', form.experience),
      block('GOALS', form.goals),
      block('SUPPORTING DOCUMENTS', form.supportingDocuments),
    ];
  }
  return parts.filter(Boolean).join('\n\n');
}

function requestedDocumentType(prompt) {
  const lower = prompt.toLowerCase();
  if (/\bcurriculum vitae|\bcv\b/.test(lower)) return 'cv';
  if (/\bcover letter\b/.test(lower)) return 'cover-letter';
  if (/\bapplication letter\b/.test(lower)) return 'application-letter';
  if (/\bscholarship letter\b|\bscholarship\b/.test(lower)) return 'scholarship-letter';
  if (/\binternship letter\b|\binternship\b/.test(lower)) return 'internship-letter';
  if (/\bresignation letter\b|\bresignation\b|\bresign\b/.test(lower)) return 'resignation-letter';
  if (/\bresume\b|\bcurriculum\b/.test(lower)) return 'resume';
  if (/\bother document\b/.test(lower)) return 'other';
  return null;
}

function getAssistantReply(prompt, hasDocument, documentType, templateId) {
  const lower = prompt.toLowerCase();
  const label = documentType ? (TYPE_LABELS[documentType] || 'document') : 'document';
  const tplNum = (templateId || 'template-1').replace('template-', '');
  if (/how many templates|number of templates|template count|how many styles/.test(lower)) {
    return 'DocuAI has 56 distinct templates. Each one has its own palette, typography, and layout, and the selected style carries into PDF and DOCX exports.';
  }
  if (/\b(download|export)\b/.test(lower)) {
    return hasDocument
      ? `Your ${label.toLowerCase()} exports from the same active draft shown in Chat and Workplace, using the template you selected.`
      : 'After you generate a document, use Download PDF or Download DOCX in Workplace. The export uses the template you selected.';
  }
  if (/\b(template|style|layout)\b/.test(lower)) {
    return hasDocument
      ? `This ${label.toLowerCase()} is using template ${tplNum}. Open Change Template to compare all 56 styles.`
      : 'You can choose from 56 distinct templates after generating a document.';
  }
  if (hasDocument && /what should i include|what information|missing|recommend/.test(lower)) {
    const prompts = {
      resume: 'For a resume, add the target job, measurable achievements, responsibilities, education, technical and soft skills, tools, certifications, projects, and links.',
      cv: 'For a CV, add academic honors, research interests, thesis or dissertation, publications, conferences, teaching, grants, memberships, and detailed experience where applicable.',
      'cover-letter': 'For a tailored cover letter, add the job description, company, position, recipient, why this company and role, matching strengths, one achievement, and your availability.',
      'application-letter': 'For an application letter, add the opportunity, recipient, qualifications, education, relevant experience, achievements, purpose, contribution, and supporting information.',
      'scholarship-letter': 'For a scholarship letter, add academic performance, scholarship criteria, goals, impact, and (only when relevant) financial need, circumstances, and expenses.',
      'internship-letter': 'For an internship letter, add the department, duration, dates, required hours, coursework, projects, skills, learning goals, and required supporting documents.',
      'resignation-letter': 'For a resignation letter, add your position, the recipient, your last working day, a short thank-you, a handover plan, and any company property you will return.',
    };
    return prompts[documentType] || 'Tell me the purpose, audience, source information, desired tone, and any required supporting details so I can shape the document around your request.';
  }
  if (/\b(afraid|scared|anxious|nervous|worried)\b/.test(lower)) {
    return hasDocument
      ? 'It is okay to feel unsure. We can take this one section at a time — I can help you rewrite, simplify, or strengthen any part.'
      : 'It is okay to feel afraid. Tell me what you are facing, or describe the document you need, and I will help you take the next step.';
  }
  if (/\b(hello|hi|hey)\b/.test(lower)) return 'Hi! I\u2019m here to help. You can ask a question, describe a document, or choose a document type to get started.';
  if (/\b(help|how do i|what can you)\b/.test(lower)) return 'I can help you create a resume, CV, cover letter, application letter, scholarship letter, internship letter, resignation letter, or another document.';
  if (/what is a resume/.test(lower)) return 'A resume is a concise, job-focused summary of your experience, achievements, education, and skills.';
  if (/what is a cv|difference between.*resume.*cv/.test(lower)) return 'A CV is usually more detailed and academic than a resume. It can include research, publications, conferences, teaching, honors, grants, and memberships.';
  if (/what is a cover letter/.test(lower)) return 'A cover letter is a role-specific letter that connects your supplied experience and strengths to one company and position.';
  if (/\b(tip|tips|advice|suggestion|suggestions)\b/.test(lower)) return 'A strong document is specific and easy to scan: lead with your goal, use real examples, show outcomes where possible, and keep the tone appropriate for the reader.';
  if (hasDocument && lower.includes('shorten')) return 'I made the document shorter in Chat. The Workplace preview is using the same updated draft.';
  if (hasDocument && (lower.includes('rewrite') || lower.includes('improve'))) return 'I updated the live document in Chat. The Workplace preview is synchronized with the same content.';
  if (hasDocument) return `I understand you are asking about "${prompt}". I can answer questions using the information you provided, or update the draft when you ask me to shorten, rewrite, improve, or reorganize it.`;
  return `I understand you are asking: "${prompt}". I can answer that directly, or help you create a resume, CV, cover letter, application letter, scholarship letter, internship letter, resignation letter, or another document.`;
}
