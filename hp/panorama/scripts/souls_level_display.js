"use strict";

var currentSoulsLevel = -1;
var soulsLevelElement = null;

function ConvertAndSetValue(sourceElementId, targetElementId, conversionFunction) {
    var sourceElement = $('#' + sourceElementId);
    if (!sourceElement) {
        $.Msg('Source element not found: ' + sourceElementId);
        return;
    }

    var sourceValue = sourceElement.text;
    if (!sourceValue) {
        $.Msg('No value found in source element');
        return;
    }

    var numericValue = parseValueWithSuffix(sourceValue);

    var convertedValue = conversionFunction(numericValue);

    var targetElement = $('#' + targetElementId);
    if (!targetElement) {
        $.Msg('Target element not found: ' + targetElementId);
        return;
    }

    targetElement.text = convertedValue.toString();

    return convertedValue;
}

function parseValueWithSuffix(value) {
    if (typeof value !== 'string') {
        return parseFloat(value) || 0;
    }
    
    var cleanValue = value.trim();
    
    var numberMatch = cleanValue.match(/^[\d.,]+/);
    if (!numberMatch) {
        return 0;
    }
    
    var numberPart = numberMatch[0];
    var suffixPart = cleanValue.slice(numberPart.length).trim();
    
    var parsedNumber = parseFloat(numberPart.replace(/,/g, ''));
    if (isNaN(parsedNumber)) {
        return 0;
    }

    if (suffixPart.length > 0) {
        return parsedNumber * 1000;
    }

    return parsedNumber;
}

function ConvertSoulsToLevel(souls) {
    var soulThresholds = [
        400, 700, 1000, 1300, 1900, 2600, 3400, 4200, 5000, 
        5800, 6600, 7500, 8400, 9400, 10600, 12000, 13600, 15400, 17400, 
        19400, 21400, 23400, 25400, 27400, 29400, 31400, 33400, 35400, 37400, 
        39400, 41400, 43400, 45400
    ];
    
    var left = 0;
    var right = soulThresholds.length - 1;
    var level = 0;
    
    while (left <= right) {
        var mid = Math.floor((left + right) / 2);
        
        if (soulThresholds[mid] <= souls) {
            level = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    return level;
}

function getSoulsProgressToNextLevel(souls, currentLevel) {
    var soulThresholds = [
        400, 700, 1000, 1300, 1900, 2600, 3400, 4200, 5000, 
        5800, 6600, 7500, 8400, 9400, 10600, 12000, 13600, 15400, 17400, 
        19400, 21400, 23400, 25400, 27400, 29400, 31400, 33400, 35400, 37400, 
        39400, 41400, 43400, 45400
    ];
    
    if (currentLevel >= soulThresholds.length - 1) {
        return 1.0;
    }
    
    var currentThreshold = currentLevel >= 0 ? soulThresholds[currentLevel] : 0;
    var nextThreshold = soulThresholds[currentLevel + 1];
    
    var progress = (souls - currentThreshold) / (nextThreshold - currentThreshold);
    
    return Math.max(0, Math.min(1, progress));
}

function updateSoulsProgressBar(progress) {
    var soulsLevelProgress = $('#SoulsLevelProgress');
    if (!soulsLevelProgress) {
        return;
    }
    
    var degrees = progress * 360;
    
    soulsLevelProgress.style.clip = `radial(50% 50%, 0deg, ${degrees}deg)`;
}

function getSoulsLevelClass(level) {
    if (level >= 0 && level <= 32) {
        return 'SoulsLevel_' + level;
    }
    
    return 'SoulsLevel_0';
}

function updateSoulsLevelAppearance(level) {
    if (!soulsLevelElement) {
        soulsLevelElement = $('#SoulsLevel');
        if (!soulsLevelElement) {
            $.Msg('SoulsLevel element not found');
            return;
        }
    }
    
    var soulsLevelContainer = $('#SoulsLevelContainer');
    var soulsLevelProgress = $('#SoulsLevelProgress');
    
    if (!soulsLevelContainer || !soulsLevelProgress) {
        $.Msg('SoulsLevel container or progress element not found');
        return;
    }
    
    for (var i = 0; i <= 32; i++) {
        soulsLevelElement.RemoveClass('SoulsLevel_' + i);
        soulsLevelContainer.RemoveClass('SoulsLevel_' + i);
    }

    var newClass = getSoulsLevelClass(level);
    soulsLevelElement.AddClass(newClass);
    soulsLevelContainer.AddClass(newClass);
    
    if (level > currentSoulsLevel && currentSoulsLevel !== -1) {
        soulsLevelElement.AddClass('SoulsLevel_LevelUp');
        
        $.Schedule(0.3, function() {
            if (soulsLevelElement) {
                soulsLevelElement.RemoveClass('SoulsLevel_LevelUp');
            }
        });
    }
    
    currentSoulsLevel = level;
}

function UpdateSoulsLevel() {
    var newLevel = ConvertAndSetValue('SoulsValue', 'SoulsLevel', ConvertSoulsToLevel);
    
    if (newLevel !== undefined) {
        updateSoulsLevelAppearance(newLevel);
        
        var soulsValue = $('#SoulsValue');
        if (soulsValue) {
            var soulsText = soulsValue.text;
            var soulsAmount = parseValueWithSuffix(soulsText);
            var progress = getSoulsProgressToNextLevel(soulsAmount, newLevel);
            updateSoulsProgressBar(progress);
        }
    }
}

(function SoulsPoll() {
    UpdateSoulsLevel();
    $.Schedule( 0.5, SoulsPoll );
})();