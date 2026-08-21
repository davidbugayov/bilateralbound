(function () {
  'use strict'

  // Combined structured data for BilateralBound
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'BilateralBound',
      alternateName: 'Free Online EMDR Tool — Bilateral Stimulation Light Bar',
      description:
        'Free online EMDR tool with bilateral stimulation light bar for anxiety, stress, and PTSD relief. No registration required.',
      url: 'https://emdrbilateral.online/',
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web Browser',
      browserRequirements:
        'Requires JavaScript, Modern browser (Chrome, Firefox, Safari, Edge)',
      datePublished: '2024-01-01',
      dateModified: '2026-05-18',
      inLanguage: ['ru', 'en', 'de', 'es', 'fr', 'pt', 'ja', 'zh'],
      isAccessibleForFree: true,
      featureList: [
        'Real-time bilateral stimulation',
        'WebSocket real-time sync',
        'Remote EMDR sessions',
        'Bilateral audio (left/right ear alternation)',
        'Permanent session links',
        'No registration required',
        'Free for therapists and patients',
        '8 languages supported'
      ],
      author: {
        '@type': 'Person',
        name: 'David Bugaev',
        url: 'https://github.com/davidbugayov'
      },
      publisher: {
        '@type': 'Organization',
        name: 'BilateralBound',
        logo: {
          '@type': 'ImageObject',
          url: 'https://emdrbilateral.online/emdr-eye.png',
          width: 512,
          height: 512
        }
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock'
      }
    },
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
          healthCondition: [
            'PTSD',
            'Anxiety',
            'Depression',
            'Phobia',
            'Trauma'
          ]
        },
        {
          '@type': 'MedicalAudience',
          audienceType: 'Clinician'
        }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is EMDR therapy?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'EMDR (Eye Movement Desensitization and Reprocessing) is an evidence-based psychotherapy that uses bilateral stimulation — typically eye movements — to help the brain reprocess traumatic memories. Recognised by WHO and APA for PTSD treatment.'
          }
        },
        {
          '@type': 'Question',
          name: 'How does BilateralBound work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The therapist creates a session and sends a viewer link to the patient. The therapist controls a moving ball in real-time — the patient follows it with their eyes, creating bilateral stimulation. No software installation needed.'
          }
        },
        {
          '@type': 'Question',
          name: 'Is BilateralBound free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, BilateralBound is completely free for therapists and patients worldwide. No registration, no subscription, no time limits.'
          }
        },
        {
          '@type': 'Question',
          name: 'Does EMDR therapy work online?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Research supports the effectiveness of telehealth EMDR. BilateralBound delivers real-time bilateral stimulation over WebSocket with millisecond precision.'
          }
        },
        {
          '@type': 'Question',
          name: 'What conditions does EMDR treat?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'EMDR treats PTSD, anxiety, depression, phobias, OCD, and trauma. It is also used in couples therapy for processing shared traumatic experiences.'
          }
        },
        {
          '@type': 'Question',
          name: 'Does the therapist need special training to use BilateralBound?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. EMDR therapy should only be conducted by qualified, EMDR-trained therapists. BilateralBound provides the bilateral stimulation tool — clinical judgement and technique remain the therapist\'s responsibility.'
          }
        }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://emdrbilateral.online/'
        }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'BilateralBound',
      url: 'https://emdrbilateral.online/',
      logo: {
        '@type': 'ImageObject',
        url: 'https://emdrbilateral.online/emdr-eye.png',
        width: 512,
        height: 512
      },
      sameAs: ['https://github.com/davidbugayov'],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        availableLanguage: [
          'Russian',
          'English',
          'German',
          'Spanish',
          'French',
          'Portuguese',
          'Japanese',
          'Chinese'
        ]
      }
    }
  ]

  // Inject structured data into page
  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.text = JSON.stringify(structuredData)
  document.head.appendChild(script)
})()
