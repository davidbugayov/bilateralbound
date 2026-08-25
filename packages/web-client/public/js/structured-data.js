(function () {
  'use strict'

  // MedicalWebPage structured data — the only unique object not already
  // present in the inline JSON-LD in index.html. Inline covers WebApplication,
  // Organization, FAQPage and BreadcrumbList for no-JS crawlers (Yandex).
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'MedicalWebPage',
      name: 'EMDR Therapy Online — BilateralBound',
      url: 'https://emdrbilateral.online/',
      description:
        'Free online EMDR therapy platform using bilateral stimulation for therapists and patients treating PTSD, anxiety, and trauma.',
      lastReviewed: '2026-05-18',
      inLanguage: ['ru', 'en', 'de', 'es', 'fr', 'pt', 'ja', 'zh'],
      specialty: 'https://schema.org/Psychiatry',
      reviewedBy: {
        '@type': 'Person',
        name: 'David Bugaev',
        url: 'https://github.com/davidbugayov'
      },
      about: {
        '@type': 'MedicalTherapy',
        name: 'EMDR',
        alternateName: 'Eye Movement Desensitization and Reprocessing',
        medicalSpecialty: 'Psychiatry',
        relevantSpecialty: ['Psychology', 'Psychotherapy']
      },
      audience: [
        {
          '@type': 'MedicalAudience',
          audienceType: 'Patient',
          healthCondition: ['PTSD', 'Anxiety', 'Depression', 'Phobia', 'Trauma']
        },
        {
          '@type': 'MedicalAudience',
          audienceType: 'Clinician'
        }
      ]
    }
  ]

  // Inject structured data into page
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.text = JSON.stringify(structuredData)
  document.head.appendChild(script)
})()
