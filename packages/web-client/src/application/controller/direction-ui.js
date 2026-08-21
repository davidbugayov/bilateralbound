'use strict';
/**
 * Direction UI — direction buttons active state, direction info lookup,
 * direction display indicator.
 * @module application/controller/direction-ui
 */

let _deps = {};

function init(deps) {
  _deps = deps;
}

function updateDirectionButtons() {
  const currentMode = _deps.getCurrentDirectionMode();
  const directionButtons = document.querySelectorAll('[data-mode]');
  for (const button of directionButtons) {
    button.classList.toggle('active', button.dataset.mode === currentMode);
  }
  const fsDirectionButtons = {
    fsDirH: 'horizontal',
    fsDirV: 'vertical',
    fsDirDL: 'diagRLL',
    fsDirDR: 'diagRL',
    fsDirRandom: 'random',
  };
  for (const [id, mode] of Object.entries(fsDirectionButtons)) {
    const button = document.getElementById(id);
    if (button) {
      button.classList.toggle('active', mode === currentMode);
    }
  }
}

function getDirectionInfo(mode) {
  switch (mode) {
    case 'horizontal':
      return {
        text:
          globalThis.i18n?.t('controller.horizontalFull') || '↔️ Horizontal',
        icon: '↔️',
      };
    case 'vertical':
      return {
        text: globalThis.i18n?.t('controller.verticalFull') || '↕️ Vertical',
        icon: '↕️',
      };
    case 'diagRL':
      return {
        text: globalThis.i18n?.t('controller.diagLTRB') || '↘️ Diagonal',
        icon: '↘️',
      };
    case 'diagRLL':
      return {
        text: globalThis.i18n?.t('controller.diagLBRT') || '↗️ Diagonal',
        icon: '↗️',
      };
    case 'random':
      return {
        text: globalThis.i18n?.t('controller.randomFull') || '🎲 Random',
        icon: '🎲',
      };
    case 'infinity':
      return {
        text: globalThis.i18n?.t('controller.infinityFull') || '∞ Infinity',
        icon: '∞',
      };
    default:
      return {
        text: globalThis.i18n?.t('controller.unknownDirection') || '❓ Unknown',
        icon: '❓',
      };
  }
}

function updateDirectionDisplay(dirX, dirY, customText = null) {
  try {
    const directionDisplay = document.getElementById('currentDirectionDisplay');
    let directionText = customText || 'Unknown';
    let directionIcon;
    if (!customText) {
      const currentMode = _deps.getCurrentDirectionMode();
      const directionInfo = getDirectionInfo(currentMode);
      directionText = directionInfo.text;
      directionIcon = directionInfo.icon;
    }
    if (directionDisplay) {
      directionDisplay.textContent = directionIcon || '❓';
      directionDisplay.title = directionText;
    }
    const fsDirectionDisplay = document.getElementById('fsCurrentDirection');
    if (fsDirectionDisplay) {
      fsDirectionDisplay.textContent =
        directionDisplay?.textContent || directionIcon || '❓';
    }
  } catch (error) {
    console.error('Ошибка обновления отображения направления:', error);
  }
}

module.exports = {
  init,
  updateDirectionButtons,
  getDirectionInfo,
  updateDirectionDisplay,
};
