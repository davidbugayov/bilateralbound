#!/usr/bin/env python3
"""Add missing meta description translations to all 8 locale files."""

import json
import os

LOCALES_DIR = os.path.join(os.path.dirname(__file__), '..', 'packages', 'web-client', 'public', 'locales')

translations = {
    "en": {
        "offer.metaDescription": "Terms of Service and public offer agreement for BilateralBound — EMDR therapy platform. Read about free and premium services, liability, and dispute resolution."
    },
    "ru": {
        "offer.metaDescription": "Условия публичной оферты BilateralBound — платформы для EMDR терапии. Ознакомьтесь с бесплатными и платными услугами, ответственностью и разрешением споров."
    },
    "es": {
        "controller.meta.controllerTitle": "Control de Sesión | BilateralBound",
        "controller.meta.controllerDescription": "Controlador de terapia EMDR para gestionar la estimulación bilateral. Herramienta para terapeutas EMDR durante sesiones de terapia de pareja",
        "about.metaTitle": "Acerca de la Terapia EMDR | BilateralBound",
        "about.metaDescription": "Aprenda sobre la terapia EMDR, cómo funciona BilateralBound para la estimulación bilateral y cómo los terapeutas la utilizan para el tratamiento del TEPT, la ansiedad y el trauma.",
        "offer.metaDescription": "Términos de Servicio y oferta pública para BilateralBound — plataforma de terapia EMDR. Lea sobre servicios gratuitos y premium, responsabilidad y resolución de disputas."
    },
    "fr": {
        "controller.meta.controllerTitle": "Contrôle de Session | BilateralBound",
        "controller.meta.controllerDescription": "Contrôleur de thérapie EMDR pour gérer la stimulation bilatérale. Outil pour les thérapeutes EMDR lors des séances de thérapie de couple",
        "about.metaTitle": "À propos de la Thérapie EMDR | BilateralBound",
        "about.metaDescription": "Découvrez la thérapie EMDR, comment BilateralBound fonctionne pour la stimulation bilatérale et comment les thérapeutes l'utilisent pour le traitement du TSPT, de l'anxiété et des traumatismes.",
        "offer.metaDescription": "Conditions d'utilisation et offre publique pour BilateralBound — plateforme de thérapie EMDR. Découvrez les services gratuits et premium, la responsabilité et la résolution des litiges."
    },
    "de": {
        "controller.meta.controllerTitle": "Sitzungssteuerung | BilateralBound",
        "controller.meta.controllerDescription": "EMDR-Therapie-Controller zur Steuerung der bilateralen Stimulation. Werkzeug für EMDR-Therapeuten bei Paartherapiesitzungen",
        "about.metaTitle": "Über EMDR-Therapie | BilateralBound",
        "about.metaDescription": "Erfahren Sie mehr über EMDR-Therapie, wie BilateralBound für bilaterale Stimulation funktioniert und wie Therapeuten es zur Behandlung von PTBS, Angstzuständen und Traumata einsetzen.",
        "offer.metaDescription": "Nutzungsbedingungen und öffentliches Angebot für BilateralBound — EMDR-Therapieplattform. Lesen Sie über kostenlose und Premium-Dienste, Haftung und Streitbeilegung."
    },
    "pt": {
        "controller.meta.controllerTitle": "Controle de Sessão | BilateralBound",
        "controller.meta.controllerDescription": "Controlador de terapia EMDR para gerenciar a estimulação bilateral. Ferramenta para terapeutas EMDR durante sessões de terapia de casal",
        "about.metaTitle": "Sobre a Terapia EMDR | BilateralBound",
        "about.metaDescription": "Saiba mais sobre a terapia EMDR, como o BilateralBound funciona para estimulação bilateral e como os terapeutas o utilizam para o tratamento de TEPT, ansiedade e trauma.",
        "offer.metaDescription": "Termos de uso e oferta pública para BilateralBound — plataforma de terapia EMDR. Leia sobre serviços gratuitos e premium, responsabilidade e resolução de disputas."
    },
    "ja": {
        "controller.meta.controllerTitle": "セッションコントロール | BilateralBound",
        "controller.meta.controllerDescription": "両側性刺激を管理するEMDRセラピーコントローラー。カップルセラピーセッション中のEMDRセラピスト向けツール",
        "about.metaTitle": "EMDR療法について | BilateralBound",
        "about.metaDescription": "EMDR療法、BilateralBoundの両側性刺激の仕組み、セラピストがPTSD、不安、トラウマ治療にどのように使用するかについて学びましょう。",
        "offer.metaDescription": "BilateralBound — EMDRセラピープラットフォームの利用規約と公開オファー。無料・プレミアムサービス、免責事項、紛争解決について。"
    },
    "zh": {
        "controller.meta.controllerTitle": "会话控制 | BilateralBound",
        "controller.meta.controllerDescription": "用于管理双侧刺激的EMDR治疗控制器。夫妻治疗会话中EMDR治疗师的工具",
        "about.metaTitle": "关于EMDR疗法 | BilateralBound",
        "about.metaDescription": "了解EMDR疗法，BilateralBound如何进行双侧刺激，以及治疗师如何将其用于PTSD、焦虑和创伤治疗。",
        "offer.metaDescription": "BilateralBound — EMDR治疗平台的服务条款和公开要约协议。了解免费和高级服务、责任和争议解决。"
    }
}


def deep_set(d, key_path, value):
    """Set nested dict value from dot-separated key path."""
    keys = key_path.split('.')
    for k in keys[:-1]:
        if k not in d:
            d[k] = {}
        d = d[k]
    d[keys[-1]] = value


for lang, updates in translations.items():
    filepath = os.path.join(LOCALES_DIR, lang, 'common.json')
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for key, value in updates.items():
        deep_set(data, key, value)
        print(f"  {lang}: {key} = {value[:70]}...")

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  => {lang}/common.json saved")

print("\nAll 8 locale files updated.")
