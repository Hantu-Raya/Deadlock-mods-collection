(function () {
  "use strict";
  var DATA = {"sourceSha256":"5e9df591c60855b54331ab32f19581ab26363a2cd89f9aa5b4dd8c1dce586bb0","defaults":{"enabled":true,"widthScale":148,"heightScale":80,"positionX":0,"positionY":-38,"enemyEnabled":true,"enemyVisible":true,"enemyMode":"gradient","enemyLow":"#FD4949","enemyMid":"#FF7B00","enemyHigh":"#00FF00","enemyTeamHigh":false,"enemyHealing":"#5FFF80","enemyDelta":"#FFE55B","enemyBulletShield":"#FFFFFF","allyEnabled":false,"allyVisible":true,"allyMode":"fixed","allyLow":"#FFEFD7","allyMid":"#FFEFD7","allyHigh":"#FFEFD7","allyHealing":"#5FFF80","allyDelta":"#504C47","allyBulletShield":"#FFFFFF","ultMode":"follow","ultCustom":"#E16161","readoutVisible":true,"readoutSize":145,"readoutFont":"oracle","readoutOffsetX":18,"readoutOffsetY":14,"readoutColorMode":"bar","readoutMode":"fixed","readoutLow":"#E16161","readoutMid":"#FF7B00","readoutHigh":"#FFFFFF","pipsVisible":true,"levelsVisible":true,"lowThreshold":25,"highThreshold":65,"enemyPulseEnabled":true,"enemyPulseThreshold":25,"enemyPulseBpm":75,"enemyPulseIntensity":1,"enemyPulseColorEnabled":false,"enemyPulseColorMode":"gradient","enemyPulseColor":"#FF2222","enemyPulseHideBar":false,"enemyPulseReadout":false,"enemyPulseReadoutModifiers":false,"enemyPulseReadoutSize":145,"enemyPulseReadoutOffsetX":0,"enemyPulseReadoutOffsetY":0,"allyPulseEnabled":false,"allyPulseThreshold":25,"allyPulseBpm":75,"allyPulseIntensity":1,"allyPulseColorEnabled":false,"allyPulseColor":"#FF2222","enemyKillMarkerEnabled":false,"enemyKillMarkerThreshold":25,"enemyKillMarkerWidth":3,"enemyKillMarkerColor":"#FF2222","allyTeamHigh":false,"staminaWidth":110,"staminaHeight":44.8,"staminaOffsetX":0,"staminaOffsetY":0,"enemyStaminaColorEnabled":false,"enemyStaminaColor":"#FD4949","allyPulseColorMode":"fixed","accessoryAnchorEnabled":true,"ultOffsetX":74,"ultOffsetY":-29,"levelOffsetX":74,"levelOffsetY":-29,"pickupTimersEnabled":true,"pickupGunColor":"#EC9719","pickupMovementColor":"#6E65EA","pickupSpiritColor":"#CE90FF","pickupSurvivalColor":"#7BBA1D","pickupBackgroundDarkness":70,"pickupGlyphColor":"#10130D","pickupSize":22,"pickupSpacing":1,"pickupOffsetX":0,"pickupOffsetY":0,"ultimateTimerEnabled":true,"ultimateTimerSize":100,"ultimateTimerDarkness":99,"ultimateTimerColorMode":"follow","ultimateTimerUnavailableColor":"#E16161","ultimateTimerAvailableColor":"#7BBA1D","allyReadoutVisible":false,"allyReadoutSize":145,"allyReadoutFont":"default","allyReadoutOffsetX":0,"allyReadoutOffsetY":0,"allyReadoutColorMode":"bar","allyReadoutMode":"fixed","allyReadoutLow":"#E16161","allyReadoutMid":"#FF7B00","allyReadoutHigh":"#FFFFFF","npcEnemyEnabled":false,"npcAllyEnabled":false,"npcNeutralEnabled":false,"buildingEnemyEnabled":false,"buildingAllyEnabled":false,"neutralColor":"#5BEFB5","criticalIndicatorVisible":true,"playerNamesVisible":true,"enemyNameColorEnabled":false,"enemyNameColor":"#FF6A6A","allyNameColorEnabled":false,"allyNameColor":"#FFFFFF","nameSize":14,"nameOffsetX":0,"nameOffsetY":0,"enemyPipColorEnabled":true,"enemyPipColor":"#000000","allyPipColorEnabled":false,"allyPipColor":"#042517","pipOpacity":100,"staminaShape":"arrow","readoutOutlineWidth":5,"allyReadoutOutlineWidth":5,"nameOutlineWidth":5,"hudHealthColorMode":"off","hudHealthColor":"#FFFF00","allyPulseReadout":false,"nameAlign":"center","hpTextAlign":"left","criticalOffsetX":0,"criticalOffsetY":0,"assassinateOffsetX":0,"assassinateOffsetY":0,"barMask":"none","nameRiseWithPips":true,"damageShakeEnabled":true,"damageShakeIntensity":3,"nameTilt":0,"readoutTilt":0,"allyReadoutTilt":0,"enemyRatkingArmor":"#C7A674","allyRatkingArmor":"#C7A674","barOutlineEnabled":true,"barOutlineThickness":1,"barOutlineOpacity":100,"barOutlineColor":"#000000","barOutlineCustomColor":false,"allyBarOutlineColor":"#000000","rejuvOffsetX":0,"rejuvOffsetY":0,"rejuvTilt":6,"rejuvScale":100},"codecDefaults":{"enabled":true,"widthScale":100,"heightScale":100,"positionX":0,"positionY":0,"staminaWidth":110,"staminaHeight":44.8,"staminaOffsetX":0,"staminaOffsetY":0,"enemyStaminaColorEnabled":false,"enemyStaminaColor":"#FD4949","enemyEnabled":true,"enemyVisible":true,"enemyMode":"gradient","enemyLow":"#E16161","enemyMid":"#FF7B00","enemyHigh":"#00FF00","enemyTeamHigh":false,"excludeBuildings":false,"excludeBosses":false,"enemyHealing":"#5FFF80","enemyDelta":"#FFE55B","enemyBulletShield":"#FFFFFF","allyEnabled":false,"allyVisible":true,"allyMode":"fixed","allyLow":"#E16161","allyMid":"#FFED79","allyHigh":"#70F8C1","allyHealing":"#5FFF80","allyDelta":"#504C47","allyBulletShield":"#FFFFFF","ultMode":"follow","ultCustom":"#E16161","readoutVisible":true,"readoutFormat":"hp","readoutSize":145,"readoutFont":"default","readoutOffsetX":0,"readoutOffsetY":0,"readoutColorMode":"bar","readoutMode":"fixed","readoutLow":"#E16161","readoutMid":"#FF7B00","readoutHigh":"#FFFFFF","pipsVisible":true,"precisePipsEnabled":false,"levelsVisible":true,"lowThreshold":25,"highThreshold":65,"enemyPulseEnabled":true,"enemyPulseThreshold":25,"enemyPulseBpm":75,"enemyPulseIntensity":1,"enemyPulseColorEnabled":false,"enemyPulseColorMode":"gradient","enemyPulseColor":"#FF2222","enemyPulseHideBar":false,"enemyPulseReadout":false,"enemyPulseReadoutModifiers":false,"enemyPulseReadoutSize":145,"enemyPulseReadoutOffsetX":0,"enemyPulseReadoutOffsetY":0,"allyPulseEnabled":false,"allyPulseThreshold":25,"allyPulseBpm":75,"allyPulseIntensity":1,"allyPulseColorEnabled":false,"allyPulseColor":"#FF2222","allyPulseColorMode":"fixed","enemyKillMarkerEnabled":false,"enemyKillMarkerThreshold":25,"enemyKillMarkerWidth":3,"enemyKillMarkerColor":"#FF2222","excludeGhouls":false,"ghoulOpacityEnabled":false,"ghoulOpacity":100,"readoutMaxTeamColor":false,"allyTeamHigh":false,"accessoryAnchorEnabled":true,"ultOffsetX":0,"ultOffsetY":0,"levelOffsetX":0,"levelOffsetY":0,"pickupTimersEnabled":true,"pickupGunColor":"#EC9719","pickupMovementColor":"#6E65EA","pickupSpiritColor":"#CE90FF","pickupSurvivalColor":"#7BBA1D","pickupBackgroundDarkness":70,"pickupGlyphColor":"#10130D","pickupSize":22,"pickupSpacing":1,"pickupOffsetX":0,"pickupOffsetY":0,"ultimateTimerEnabled":true,"ultimateTimerSize":100,"ultimateTimerDarkness":99,"ultimateTimerColorMode":"follow","ultimateTimerUnavailableColor":"#E16161","ultimateTimerAvailableColor":"#7BBA1D","allyReadoutVisible":false,"allyReadoutFormat":"hp","allyReadoutSize":145,"allyReadoutFont":"default","allyReadoutOffsetX":0,"allyReadoutOffsetY":0,"allyReadoutColorMode":"bar","allyReadoutMode":"fixed","allyReadoutLow":"#E16161","allyReadoutMid":"#FF7B00","allyReadoutHigh":"#FFFFFF","allyReadoutMaxTeamColor":false,"npcEnemyEnabled":false,"npcAllyEnabled":false,"npcNeutralEnabled":false,"buildingEnemyEnabled":false,"buildingAllyEnabled":false,"neutralColor":"#5BEFB5","criticalIndicatorVisible":true,"playerNamesVisible":true,"enemyNameColorEnabled":false,"enemyNameColor":"#FF6A6A","allyNameColorEnabled":false,"allyNameColor":"#FFFFFF","nameSize":14,"nameOffsetX":0,"nameOffsetY":0,"enemyPipColorEnabled":false,"enemyPipColor":"#500202","allyPipColorEnabled":false,"allyPipColor":"#042517","pipOpacity":100,"staminaShape":"arrow","readoutOutlineWidth":5,"allyReadoutOutlineWidth":5,"nameOutlineWidth":5,"hudHealthColorMode":"off","hudHealthColor":"#FFFF00","allyPulseReadout":false,"nameAlign":"center","hpTextAlign":"left","criticalOffsetX":0,"criticalOffsetY":0,"assassinateOffsetX":0,"assassinateOffsetY":0,"barMask":"none","nameRiseWithPips":false,"damageShakeEnabled":true,"damageShakeIntensity":3,"nameTilt":0,"readoutTilt":0,"allyReadoutTilt":0,"enemyRatkingArmor":"#C7A674","allyRatkingArmor":"#C7A674","barOutlineEnabled":true,"barOutlineThickness":1,"barOutlineOpacity":100,"barOutlineColor":"#000000","barOutlineCustomColor":false,"allyBarOutlineColor":"#000000","rejuvOffsetX":0,"rejuvOffsetY":0,"rejuvTilt":6,"rejuvScale":100},"sparseDefaults":{"enabled":true,"widthScale":100,"heightScale":100,"positionX":0,"positionY":0,"enemyEnabled":true,"enemyVisible":true,"enemyMode":"gradient","enemyLow":"#FD4949","enemyMid":"#FF7B00","enemyHigh":"#00FF00","enemyTeamHigh":false,"enemyHealing":"#5FFF80","enemyDelta":"#FFE55B","enemyBulletShield":"#FFFFFF","allyEnabled":false,"allyVisible":true,"allyMode":"fixed","allyLow":"#FFEFD7","allyMid":"#FFEFD7","allyHigh":"#FFEFD7","allyHealing":"#5FFF80","allyDelta":"#504C47","allyBulletShield":"#FFFFFF","ultMode":"follow","ultCustom":"#E16161","readoutVisible":true,"readoutSize":145,"readoutFont":"default","readoutOffsetX":0,"readoutOffsetY":0,"readoutColorMode":"bar","readoutMode":"fixed","readoutLow":"#E16161","readoutMid":"#FF7B00","readoutHigh":"#FFFFFF","pipsVisible":true,"levelsVisible":true,"lowThreshold":25,"highThreshold":65,"enemyPulseEnabled":true,"enemyPulseThreshold":25,"enemyPulseBpm":75,"enemyPulseIntensity":1,"enemyPulseColorEnabled":false,"enemyPulseColorMode":"gradient","enemyPulseColor":"#FF2222","enemyPulseHideBar":false,"enemyPulseReadout":false,"enemyPulseReadoutModifiers":false,"enemyPulseReadoutSize":145,"enemyPulseReadoutOffsetX":0,"enemyPulseReadoutOffsetY":0,"allyPulseEnabled":false,"allyPulseThreshold":25,"allyPulseBpm":75,"allyPulseIntensity":1,"allyPulseColorEnabled":false,"allyPulseColor":"#FF2222","enemyKillMarkerEnabled":false,"enemyKillMarkerThreshold":25,"enemyKillMarkerWidth":3,"enemyKillMarkerColor":"#FF2222","allyTeamHigh":false,"staminaWidth":110,"staminaHeight":44.8,"staminaOffsetX":0,"staminaOffsetY":0,"enemyStaminaColorEnabled":false,"enemyStaminaColor":"#FD4949","allyPulseColorMode":"fixed","accessoryAnchorEnabled":true,"ultOffsetX":0,"ultOffsetY":0,"levelOffsetX":0,"levelOffsetY":0,"pickupTimersEnabled":true,"pickupGunColor":"#EC9719","pickupMovementColor":"#6E65EA","pickupSpiritColor":"#CE90FF","pickupSurvivalColor":"#7BBA1D","pickupBackgroundDarkness":70,"pickupGlyphColor":"#10130D","pickupSize":22,"pickupSpacing":1,"pickupOffsetX":0,"pickupOffsetY":0,"ultimateTimerEnabled":true,"ultimateTimerSize":100,"ultimateTimerDarkness":99,"ultimateTimerColorMode":"follow","ultimateTimerUnavailableColor":"#E16161","ultimateTimerAvailableColor":"#7BBA1D","allyReadoutVisible":false,"allyReadoutSize":145,"allyReadoutFont":"default","allyReadoutOffsetX":0,"allyReadoutOffsetY":0,"allyReadoutColorMode":"bar","allyReadoutMode":"fixed","allyReadoutLow":"#E16161","allyReadoutMid":"#FF7B00","allyReadoutHigh":"#FFFFFF","npcEnemyEnabled":false,"npcAllyEnabled":false,"npcNeutralEnabled":false,"buildingEnemyEnabled":false,"buildingAllyEnabled":false,"neutralColor":"#5BEFB5","criticalIndicatorVisible":true,"playerNamesVisible":true,"enemyNameColorEnabled":false,"enemyNameColor":"#FF6A6A","allyNameColorEnabled":false,"allyNameColor":"#FFFFFF","nameSize":14,"nameOffsetX":0,"nameOffsetY":0,"enemyPipColorEnabled":false,"enemyPipColor":"#500202","allyPipColorEnabled":false,"allyPipColor":"#042517","pipOpacity":100,"staminaShape":"arrow","readoutOutlineWidth":5,"allyReadoutOutlineWidth":5,"nameOutlineWidth":5,"hudHealthColorMode":"off","hudHealthColor":"#FFFF00","allyPulseReadout":false,"nameAlign":"center","hpTextAlign":"left","criticalOffsetX":0,"criticalOffsetY":0,"assassinateOffsetX":0,"assassinateOffsetY":0,"barMask":"none","nameRiseWithPips":false,"damageShakeEnabled":true,"damageShakeIntensity":3,"nameTilt":0,"readoutTilt":0,"allyReadoutTilt":0,"enemyRatkingArmor":"#C7A674","allyRatkingArmor":"#C7A674","barOutlineEnabled":true,"barOutlineThickness":1,"barOutlineOpacity":100,"barOutlineColor":"#000000","barOutlineCustomColor":false,"allyBarOutlineColor":"#000000","rejuvOffsetX":0,"rejuvOffsetY":0,"rejuvTilt":6,"rejuvScale":100},"keys":["enabled","widthScale","heightScale","positionX","positionY","enemyEnabled","enemyVisible","enemyMode","enemyLow","enemyMid","enemyHigh","enemyTeamHigh","enemyHealing","enemyDelta","enemyBulletShield","allyEnabled","allyVisible","allyMode","allyLow","allyMid","allyHigh","allyHealing","allyDelta","allyBulletShield","ultMode","ultCustom","readoutVisible","readoutSize","readoutFont","readoutOffsetX","readoutOffsetY","readoutColorMode","readoutMode","readoutLow","readoutMid","readoutHigh","pipsVisible","levelsVisible","lowThreshold","highThreshold","enemyPulseEnabled","enemyPulseThreshold","enemyPulseBpm","enemyPulseIntensity","enemyPulseColorEnabled","enemyPulseColorMode","enemyPulseColor","enemyPulseHideBar","enemyPulseReadout","enemyPulseReadoutModifiers","enemyPulseReadoutSize","enemyPulseReadoutOffsetX","enemyPulseReadoutOffsetY","allyPulseEnabled","allyPulseThreshold","allyPulseBpm","allyPulseIntensity","allyPulseColorEnabled","allyPulseColor","enemyKillMarkerEnabled","enemyKillMarkerThreshold","enemyKillMarkerWidth","enemyKillMarkerColor","allyTeamHigh","staminaWidth","staminaHeight","staminaOffsetX","staminaOffsetY","enemyStaminaColorEnabled","enemyStaminaColor","allyPulseColorMode","accessoryAnchorEnabled","ultOffsetX","ultOffsetY","levelOffsetX","levelOffsetY","pickupTimersEnabled","pickupGunColor","pickupMovementColor","pickupSpiritColor","pickupSurvivalColor","pickupBackgroundDarkness","pickupGlyphColor","pickupSize","pickupSpacing","pickupOffsetX","pickupOffsetY","ultimateTimerEnabled","ultimateTimerSize","ultimateTimerDarkness","ultimateTimerColorMode","ultimateTimerUnavailableColor","ultimateTimerAvailableColor","allyReadoutVisible","allyReadoutSize","allyReadoutFont","allyReadoutOffsetX","allyReadoutOffsetY","allyReadoutColorMode","allyReadoutMode","allyReadoutLow","allyReadoutMid","allyReadoutHigh","npcEnemyEnabled","npcAllyEnabled","npcNeutralEnabled","buildingEnemyEnabled","buildingAllyEnabled","neutralColor","criticalIndicatorVisible","playerNamesVisible","enemyNameColorEnabled","enemyNameColor","allyNameColorEnabled","allyNameColor","nameSize","nameOffsetX","nameOffsetY","enemyPipColorEnabled","enemyPipColor","allyPipColorEnabled","allyPipColor","pipOpacity","staminaShape","readoutOutlineWidth","allyReadoutOutlineWidth","nameOutlineWidth","hudHealthColorMode","hudHealthColor","allyPulseReadout","nameAlign","hpTextAlign","criticalOffsetX","criticalOffsetY","assassinateOffsetX","assassinateOffsetY","barMask","nameRiseWithPips","damageShakeEnabled","damageShakeIntensity","nameTilt","readoutTilt","allyReadoutTilt","enemyRatkingArmor","allyRatkingArmor","barOutlineEnabled","barOutlineThickness","barOutlineOpacity","barOutlineColor","barOutlineCustomColor","allyBarOutlineColor","rejuvOffsetX","rejuvOffsetY","rejuvTilt","rejuvScale"],"codecKeys":["enabled","widthScale","heightScale","positionX","positionY","enemyEnabled","enemyVisible","enemyMode","enemyLow","enemyMid","enemyHigh","enemyTeamHigh","excludeBuildings","excludeBosses","enemyHealing","enemyDelta","enemyBulletShield","allyEnabled","allyVisible","allyMode","allyLow","allyMid","allyHigh","allyHealing","allyDelta","allyBulletShield","ultMode","ultCustom","readoutVisible","readoutFormat","readoutSize","readoutFont","readoutOffsetX","readoutOffsetY","readoutColorMode","readoutMode","readoutLow","readoutMid","readoutHigh","pipsVisible","precisePipsEnabled","levelsVisible","lowThreshold","highThreshold","enemyPulseEnabled","enemyPulseThreshold","enemyPulseBpm","enemyPulseIntensity","enemyPulseColorEnabled","enemyPulseColorMode","enemyPulseColor","enemyPulseHideBar","enemyPulseReadout","enemyPulseReadoutModifiers","enemyPulseReadoutSize","enemyPulseReadoutOffsetX","enemyPulseReadoutOffsetY","allyPulseEnabled","allyPulseThreshold","allyPulseBpm","allyPulseIntensity","allyPulseColorEnabled","allyPulseColor","enemyKillMarkerEnabled","enemyKillMarkerThreshold","enemyKillMarkerWidth","enemyKillMarkerColor","excludeGhouls","ghoulOpacityEnabled","ghoulOpacity","readoutMaxTeamColor","allyTeamHigh"],"extensionKeys":["staminaWidth","staminaHeight","staminaOffsetX","staminaOffsetY","enemyStaminaColorEnabled","enemyStaminaColor","allyPulseColorMode","accessoryAnchorEnabled","ultOffsetX","ultOffsetY","levelOffsetX","levelOffsetY","pickupTimersEnabled","pickupGunColor","pickupMovementColor","pickupSpiritColor","pickupSurvivalColor","pickupBackgroundDarkness","pickupGlyphColor","pickupSize","pickupSpacing","pickupOffsetX","pickupOffsetY","ultimateTimerEnabled","ultimateTimerSize","ultimateTimerDarkness","ultimateTimerColorMode","ultimateTimerUnavailableColor","ultimateTimerAvailableColor","allyReadoutVisible","allyReadoutFormat","allyReadoutSize","allyReadoutFont","allyReadoutOffsetX","allyReadoutOffsetY","allyReadoutColorMode","allyReadoutMode","allyReadoutLow","allyReadoutMid","allyReadoutHigh","allyReadoutMaxTeamColor","npcEnemyEnabled","npcAllyEnabled","npcNeutralEnabled","buildingEnemyEnabled","buildingAllyEnabled","neutralColor","criticalIndicatorVisible","playerNamesVisible","enemyNameColorEnabled","enemyNameColor","allyNameColorEnabled","allyNameColor","nameSize","nameOffsetX","nameOffsetY","enemyPipColorEnabled","enemyPipColor","allyPipColorEnabled","allyPipColor","pipOpacity","staminaShape","readoutOutlineWidth","allyReadoutOutlineWidth","nameOutlineWidth","hudHealthColorMode","hudHealthColor","allyPulseReadout","nameAlign","hpTextAlign","criticalOffsetX","criticalOffsetY","assassinateOffsetX","assassinateOffsetY","barMask","nameRiseWithPips","damageShakeEnabled","damageShakeIntensity","nameTilt","readoutTilt","allyReadoutTilt","enemyRatkingArmor","allyRatkingArmor","barOutlineEnabled","barOutlineThickness","barOutlineOpacity","barOutlineColor","barOutlineCustomColor","allyBarOutlineColor","rejuvOffsetX","rejuvOffsetY","rejuvTilt","rejuvScale"],"settingMeta":{"enabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"widthScale":{"type":"number","color":false,"conditionEligible":true,"min":60,"max":400,"options":[]},"heightScale":{"type":"number","color":false,"conditionEligible":true,"min":60,"max":400,"options":[]},"positionX":{"type":"number","color":false,"conditionEligible":true,"min":-2000,"max":2000,"options":[]},"positionY":{"type":"number","color":false,"conditionEligible":true,"min":-2100,"max":2100,"options":[]},"enemyEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["fixed","gradient"]},"enemyLow":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyMid":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyHigh":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyTeamHigh":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyHealing":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyDelta":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyBulletShield":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["fixed","gradient"]},"allyLow":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyMid":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyHigh":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyHealing":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyDelta":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyBulletShield":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"ultMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["follow","custom"]},"ultCustom":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"readoutVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"readoutSize":{"type":"number","color":false,"conditionEligible":true,"min":72,"max":320,"options":[]},"readoutFont":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["default","oracle","pulp"]},"readoutOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-334,"max":334,"options":[]},"readoutOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-350,"max":350,"options":[]},"readoutColorMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["bar","custom"]},"readoutMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["fixed","gradient"]},"readoutLow":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"readoutMid":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"readoutHigh":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pipsVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"levelsVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"lowThreshold":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":99,"options":[]},"highThreshold":{"type":"number","color":false,"conditionEligible":true,"min":1,"max":100,"options":[]},"enemyPulseEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPulseThreshold":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":100,"options":[]},"enemyPulseBpm":{"type":"number","color":false,"conditionEligible":true,"min":30,"max":300,"options":[]},"enemyPulseIntensity":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":2,"options":[]},"enemyPulseColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPulseColorMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["fixed","gradient"]},"enemyPulseColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPulseHideBar":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPulseReadout":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPulseReadoutModifiers":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPulseReadoutSize":{"type":"number","color":false,"conditionEligible":true,"min":72,"max":320,"options":[]},"enemyPulseReadoutOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-334,"max":334,"options":[]},"enemyPulseReadoutOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-350,"max":350,"options":[]},"allyPulseEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyPulseThreshold":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":100,"options":[]},"allyPulseBpm":{"type":"number","color":false,"conditionEligible":true,"min":30,"max":300,"options":[]},"allyPulseIntensity":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":2,"options":[]},"allyPulseColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyPulseColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyKillMarkerEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyKillMarkerThreshold":{"type":"number","color":false,"conditionEligible":true,"min":5,"max":80,"options":[]},"enemyKillMarkerWidth":{"type":"number","color":false,"conditionEligible":true,"min":1,"max":100,"options":[]},"enemyKillMarkerColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyTeamHigh":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"staminaWidth":{"type":"number","color":false,"conditionEligible":true,"min":40,"max":220,"options":[]},"staminaHeight":{"type":"number","color":false,"conditionEligible":true,"min":16,"max":90,"options":[]},"staminaOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-2000,"max":2000,"options":[]},"staminaOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-2100,"max":2100,"options":[]},"enemyStaminaColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyStaminaColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyPulseColorMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["fixed","gradient"]},"accessoryAnchorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"ultOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-3334,"max":3334,"options":[]},"ultOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-3500,"max":3500,"options":[]},"levelOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-3334,"max":3334,"options":[]},"levelOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-3500,"max":3500,"options":[]},"pickupTimersEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"pickupGunColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pickupMovementColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pickupSpiritColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pickupSurvivalColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pickupBackgroundDarkness":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":100,"options":[]},"pickupGlyphColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pickupSize":{"type":"number","color":false,"conditionEligible":true,"min":12,"max":64,"options":[]},"pickupSpacing":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":16,"options":[]},"pickupOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-200,"max":200,"options":[]},"pickupOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-100,"max":100,"options":[]},"ultimateTimerEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"ultimateTimerSize":{"type":"number","color":false,"conditionEligible":true,"min":25,"max":200,"options":[]},"ultimateTimerDarkness":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":100,"options":[]},"ultimateTimerColorMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["follow","fixed","gradient"]},"ultimateTimerUnavailableColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"ultimateTimerAvailableColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyReadoutVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyReadoutSize":{"type":"number","color":false,"conditionEligible":true,"min":72,"max":320,"options":[]},"allyReadoutFont":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["default","oracle","pulp"]},"allyReadoutOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-334,"max":334,"options":[]},"allyReadoutOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-350,"max":350,"options":[]},"allyReadoutColorMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["bar","custom"]},"allyReadoutMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["fixed","gradient"]},"allyReadoutLow":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyReadoutMid":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyReadoutHigh":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"npcEnemyEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"npcAllyEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"npcNeutralEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"buildingEnemyEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"buildingAllyEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"neutralColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"criticalIndicatorVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"playerNamesVisible":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyNameColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyNameColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyNameColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyNameColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"nameSize":{"type":"number","color":false,"conditionEligible":true,"min":8,"max":40,"options":[]},"nameOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-200,"max":200,"options":[]},"nameOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-210,"max":210,"options":[]},"enemyPipColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"enemyPipColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyPipColorEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyPipColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"pipOpacity":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":100,"options":[]},"staminaShape":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["arrow","circle","box"]},"readoutOutlineWidth":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":10,"options":[]},"allyReadoutOutlineWidth":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":10,"options":[]},"nameOutlineWidth":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":10,"options":[]},"hudHealthColorMode":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["off","team","custom"]},"hudHealthColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyPulseReadout":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"nameAlign":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["left","center","right"]},"hpTextAlign":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["left","center","right"]},"criticalOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-200,"max":200,"options":[]},"criticalOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-210,"max":210,"options":[]},"assassinateOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-200,"max":200,"options":[]},"assassinateOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-210,"max":210,"options":[]},"barMask":{"type":"enum","color":false,"conditionEligible":true,"min":null,"max":null,"options":["none","original","old"]},"nameRiseWithPips":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"damageShakeEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"damageShakeIntensity":{"type":"number","color":false,"conditionEligible":true,"min":1,"max":10,"options":[]},"nameTilt":{"type":"number","color":false,"conditionEligible":true,"min":-360,"max":360,"options":[]},"readoutTilt":{"type":"number","color":false,"conditionEligible":true,"min":-360,"max":360,"options":[]},"allyReadoutTilt":{"type":"number","color":false,"conditionEligible":true,"min":-360,"max":360,"options":[]},"enemyRatkingArmor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyRatkingArmor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"barOutlineEnabled":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"barOutlineThickness":{"type":"number","color":false,"conditionEligible":true,"min":0.5,"max":10,"options":[]},"barOutlineOpacity":{"type":"number","color":false,"conditionEligible":true,"min":0,"max":100,"options":[]},"barOutlineColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"barOutlineCustomColor":{"type":"boolean","color":false,"conditionEligible":true,"min":null,"max":null,"options":[]},"allyBarOutlineColor":{"type":"color","color":true,"conditionEligible":true,"min":null,"max":null,"options":[]},"rejuvOffsetX":{"type":"number","color":false,"conditionEligible":true,"min":-200,"max":200,"options":[]},"rejuvOffsetY":{"type":"number","color":false,"conditionEligible":true,"min":-210,"max":210,"options":[]},"rejuvTilt":{"type":"number","color":false,"conditionEligible":true,"min":-360,"max":360,"options":[]},"rejuvScale":{"type":"number","color":false,"conditionEligible":true,"min":25,"max":200,"options":[]}},"retiredConditionKeys":{"ghoulOpacityEnabled":true,"ghoulOpacity":true,"readoutFormat":true,"allyReadoutFormat":true,"precisePipsEnabled":true,"readoutMaxTeamColor":true,"allyReadoutMaxTeamColor":true}};
  // Compatibility tables above are frozen input grammar, not v3 defaults.
  var own = Object.prototype.hasOwnProperty, serial = 0;
  var steps = {barOutlineThickness:0.5, ultimateTimerSize:5, rejuvScale:5, readoutOutlineWidth:0.5, allyReadoutOutlineWidth:0.5, nameOutlineWidth:0.5, staminaHeight:0.1};
  function object(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function fail() { throw new Error("That v2 code or save is incomplete or damaged."); }
  function scalar(key, value) {
    var meta = DATA.settingMeta[key];
    if (!meta) return value; // Retired append-only slots have no current setting.
    if (meta.type === "boolean") { if (typeof value !== "boolean") fail(); return value; }
    if (meta.type === "color") {
      if (typeof value !== "string") fail();
      var color = value.trim().toUpperCase(); if (color.charAt(0) !== "#") color = "#" + color;
      if (!/^#[0-9A-F]{6}$/.test(color)) fail(); return color;
    }
    if (meta.type === "enum") { if (meta.options.indexOf(value) < 0) fail(); return value; }
    if (typeof value !== "number" || !isFinite(value)) fail();
    var step = steps[key] || 1, number = Math.round(value / step) * step;
    return Math.round((meta.min === null ? number : Math.max(meta.min, Math.min(meta.max, number))) * 1e8) / 1e8;
  }
  function values(source, baseline) {
    if (source !== undefined && !object(source)) fail();
    var result = copy(baseline);
    DATA.keys.forEach(function (key) {
      result[key] = scalar(key, source && own.call(source,key) ? source[key] : baseline[key]);
      if (key === "lowThreshold") result[key] = Math.min(result[key],result.highThreshold - 1);
      if (key === "highThreshold") result[key] = Math.max(result[key],result.lowThreshold + 1);
    });
    result.lowThreshold = Math.max(0, Math.min(result.lowThreshold, result.highThreshold - 1));
    result.highThreshold = Math.max(result.lowThreshold + 1, Math.min(100, result.highThreshold));
    if ((!source || !own.call(source,"staminaShape")) && baseline !== DATA.defaults)
      result.staminaShape = result.staminaWidth !== 110 || result.staminaHeight !== 44.8 || result.enemyStaminaColorEnabled ? "box" : "arrow";
    return result;
  }
  function pairs(source, keys) {
    if (!Array.isArray(source)) fail();
    var result = {}, seen = {};
    source.forEach(function (pair) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "number" || Math.floor(pair[0]) !== pair[0] || pair[0] < 0 || pair[0] >= keys.length || seen[pair[0]]) fail();
      seen[pair[0]] = true; var key = keys[pair[0]];
      if (own.call(DATA.settingMeta,key)) result[key] = scalar(key,pair[1]);
    });
    return result;
  }
  function conditions(source) {
    if (source === undefined || source === null) return {};
    if (!object(source)) fail();
    var result = {};
    Object.keys(source).forEach(function (key) {
      if (own.call(DATA.retiredConditionKeys,key)) return;
      if (!own.call(DATA.settingMeta,key)) fail();
      var rule = source[key];
      if (!object(rule) || Math.floor(rule.slot) !== rule.slot || rule.slot < $.HPColorsV3Codec.RECORD.slotRange[0] || rule.slot > $.HPColorsV3Codec.RECORD.slotRange[1] || Math.floor(rule.minTier) !== rule.minTier || rule.minTier < $.HPColorsV3Codec.RECORD.tierRange[0] || rule.minTier > $.HPColorsV3Codec.RECORD.tierRange[1]) fail();
      var value = scalar(key,rule.value);
      if (DATA.settingMeta[key].type === "number" && value !== rule.value) fail();
      result[key] = {slot:rule.slot,minTier:rule.minTier,value:value};
    });
    return result;
  }
  function offsets(record, relative, legacyOnly) {
    if (relative) return;
    ["readoutOffsetX","readoutOffsetY","allyReadoutOffsetX","allyReadoutOffsetY","enemyPulseReadoutOffsetX","enemyPulseReadoutOffsetY"].forEach(function (key) {
      if (legacyOnly && DATA.extensionKeys.indexOf(key) >= 0) return;
      var horizontal = key.slice(-1) === "X", limit = horizontal ? 200 : 210;
      var scale = record.values[horizontal ? "widthScale" : "heightScale"] / 100;
      function convert(value) { return scalar(key,Math.round(Math.max(-limit,Math.min(limit,value)) / scale)); }
      record.values[key] = convert(record.values[key]);
      if (record.conditions[key]) record.conditions[key].value = convert(record.conditions[key].value);
    });
  }
  function unit(key,value) {
    if (key === "widthScale") return Math.round(value * 79) / 100;
    if (key === "heightScale") return Math.round(value * 18) / 100;
    if (key === "ultimateTimerSize") return value / 5;
    if (key === "rejuvScale") return Math.round(value * 24) / 100;
    if (["positionX","positionY","staminaOffsetX","staminaOffsetY","ultOffsetX","ultOffsetY","levelOffsetX","levelOffsetY","staminaWidth","staminaHeight","readoutSize","allyReadoutSize","enemyPulseReadoutSize","enemyKillMarkerWidth"].indexOf(key) >= 0) return Math.round(value * 10) / 100;
    return value;
  }
  var REMOVED = ["npcEnemyEnabled", "npcAllyEnabled"];
  var mapping = {
    barColorEnabled:["enemyEnabled","allyEnabled"],barColorMode:["enemyMode","allyMode"],barColorLow:["enemyLow","allyLow"],barColorMid:["enemyMid","allyMid"],barColorHigh:["enemyHigh","allyHigh"],barColorTeamHigh:["enemyTeamHigh","allyTeamHigh"],
    barVisible:["enemyVisible","allyVisible"],barHealingColor:["enemyHealing","allyHealing"],barDeltaColor:["enemyDelta","allyDelta"],barShieldColor:["enemyBulletShield","allyBulletShield"],barArmorColor:["enemyRatkingArmor","allyRatkingArmor"],
    barWidth:["widthScale","widthScale"],barHeight:["heightScale","heightScale"],barOffsetX:["positionX","positionX"],barOffsetY:["positionY","positionY"],
    barOutlineEnabled:["barOutlineEnabled","barOutlineEnabled"],barOutlineCustomColor:["barOutlineCustomColor","barOutlineCustomColor"],barOutlineColor:["barOutlineColor","allyBarOutlineColor"],barOutlineThickness:["barOutlineThickness","barOutlineThickness"],barOutlineOpacity:["barOutlineOpacity","barOutlineOpacity"],
    hpTextVisible:["readoutVisible","allyReadoutVisible"],hpTextFont:["readoutFont","allyReadoutFont"],hpTextSize:["readoutSize","allyReadoutSize"],hpTextColorMode:["readoutColorMode","allyReadoutColorMode"],hpTextMode:["readoutMode","allyReadoutMode"],hpTextLow:["readoutLow","allyReadoutLow"],hpTextMid:["readoutMid","allyReadoutMid"],hpTextHigh:["readoutHigh","allyReadoutHigh"],hpTextOffsetX:["readoutOffsetX","allyReadoutOffsetX"],hpTextOffsetY:["readoutOffsetY","allyReadoutOffsetY"],hpTextOutline:["readoutOutlineWidth","allyReadoutOutlineWidth"],hpTextAlign:["hpTextAlign","hpTextAlign"],
    nameVisible:["playerNamesVisible","playerNamesVisible"],nameColorEnabled:["enemyNameColorEnabled","allyNameColorEnabled"],nameColor:["enemyNameColor","allyNameColor"],nameSize:["nameSize","nameSize"],nameOffsetX:["nameOffsetX","nameOffsetX"],nameOffsetY:["nameOffsetY","nameOffsetY"],nameOutline:["nameOutlineWidth","nameOutlineWidth"],nameAlign:["nameAlign","nameAlign"],
    linesVisible:["pipsVisible",null],lineColorEnabled:["enemyPipColorEnabled","allyPipColorEnabled"],lineColor:["enemyPipColor","allyPipColor"],lineOpacity:["pipOpacity","pipOpacity"],
    killMarkerEnabled:["enemyKillMarkerEnabled"],killMarkerThreshold:["enemyKillMarkerThreshold"],killMarkerWidth:["enemyKillMarkerWidth"],killMarkerColor:["enemyKillMarkerColor"],
    levelsVisible:["levelsVisible"],levelOffsetX:["levelOffsetX"],levelOffsetY:["levelOffsetY"],ultSize:["ultimateTimerSize"],
    staminaColorEnabled:["enemyStaminaColorEnabled"],staminaColor:["enemyStaminaColor"],staminaWidth:["staminaWidth"],staminaHeight:["staminaHeight"],
    staminaOffsetX:["staminaOffsetX"],staminaOffsetY:["staminaOffsetY"],staminaShape:["staminaShape"],
    pulseEnabled:["enemyPulseEnabled","allyPulseEnabled"],pulseThreshold:["enemyPulseThreshold","allyPulseThreshold"],
    pulseBpm:["enemyPulseBpm","allyPulseBpm"],pulseIntensity:["enemyPulseIntensity","allyPulseIntensity"],
    pulseColorEnabled:["enemyPulseColorEnabled","allyPulseColorEnabled"],pulseColorMode:["enemyPulseColorMode","allyPulseColorMode"],
    pulseColor:["enemyPulseColor","allyPulseColor"],pulseReadout:["enemyPulseReadout","allyPulseReadout"],
    pulseHideBar:["enemyPulseHideBar"],pulseReadoutModifiers:["enemyPulseReadoutModifiers"],pulseReadoutSize:["enemyPulseReadoutSize"],
    pulseReadoutOffsetX:["enemyPulseReadoutOffsetX"],pulseReadoutOffsetY:["enemyPulseReadoutOffsetY"],
    rejuvSize:["rejuvScale"],
    objectiveEnabled:["buildingEnemyEnabled","buildingAllyEnabled"],neutralEnabled:["npcNeutralEnabled"],
    barStyle:["barMask"],nameRiseWithPips:["nameRiseWithPips"],
    damageShakeEnabled:["damageShakeEnabled"],damageShakeStrength:["damageShakeIntensity"],
    nameTilt:["nameTilt"],hpTextTilt:["readoutTilt","allyReadoutTilt"],
    hudHealthColorMode:["hudHealthColorMode"],hudHealthColor:["hudHealthColor"]
  };
  // Current v2 imports are already unit-converted; old v3 metadata needs its versioned repairs first.
  function promoteConditions(item, fromVersion) {
    if (item.v2conditions === undefined) return item;
    if (!object(item.v2conditions)) fail();
    var contract = $.HPColorsV3Settings, rules = copy(item.rules || {});
    Object.keys(item.v2conditions).forEach(function (key) {
      if (own.call(DATA.retiredConditionKeys, key)) return;
      if (!own.call(DATA.settingMeta, key)) fail();
      var rule = item.v2conditions[key];
      if (!object(rule) || !Number.isInteger(rule.slot) || rule.slot < $.HPColorsV3Codec.RECORD.slotRange[0] || rule.slot > $.HPColorsV3Codec.RECORD.slotRange[1] ||
          !Number.isInteger(rule.minTier) || rule.minTier < $.HPColorsV3Codec.RECORD.tierRange[0] || rule.minTier > $.HPColorsV3Codec.RECORD.tierRange[1]) fail();
      contract.controls.forEach(function (row) {
        var names = mapping[row.key], legacy = row.side === "shared" ? names && names[0] || row.key : names && names[row.side === "ally" ? 1 : 0];
        if (legacy !== key) return;
        var value = rule.value;
        if (fromVersion < 3 && key === "ultimateTimerSize") value /= 5;
        if (fromVersion === 1 && key === "enemyKillMarkerWidth") value /= 10;
        if (fromVersion < 6 && key === "rejuvScale") value = Math.round(value * 24) / 100;
        if (row.type === "number") value = Math.round(Math.max(row.bounds[0], Math.min(row.bounds[1],
          row.bounds[0] + Math.round((value - row.bounds[0]) / row.step) * row.step)) * 1e8) / 1e8;
        if (row.type === "color" && typeof value === "string") value = value.toUpperCase();
        if (!contract.validateValue(row, value)) fail();
        var cell = contract.slots.filter(function (slot) { return slot.side === row.side && slot.setting === row.key; })[0].slot;
        if (!own.call(rules, cell)) rules[cell] = { slot: rule.slot, minTier: rule.minTier, value: value };
      });
    });
    if (Object.keys(rules).length) item.rules = rules;
    delete item.v2conditions;
    return item;
  }
  function mapped(record, base, onlyLegacy) {
    var contract = $.HPColorsV3Settings, settings = copy(base && base.settings || contract.defaults), pending = copy(base && base.v2pending || {}), consumed = {};
    contract.controls.forEach(function (row) {
      var names = mapping[row.key], key = row.side === "shared" ? names && names[0] || row.key : names && names[row.side === "ally" ? 1 : 0];
      if (!key || !own.call(record.values,key) || onlyLegacy && DATA.codecKeys.indexOf(key) < 0) return;
      var value = record.values[key];
      if (row.key === "barWidth") value = value * 0.79;
      else if (row.key === "barHeight") value = value * 0.18;
      else value = unit(key,value);
      if (row.type === "number") value = Math.max(row.bounds[0],Math.min(row.bounds[1],Math.round(value / row.step) * row.step));
      var target = $.HPColorsV3Codec.valuesOf(settings,row);
      target[row.key] = typeof value === "number" ? Math.round(value * 1e8) / 1e8 : value;
      consumed[key] = true; delete pending[key];
    });
    // v2 keys whose v3 setting was removed (Customize NPC bars, user 2026-10-29) are dropped, never kept pending.
    REMOVED.forEach(function (key) { consumed[key] = true; delete pending[key]; });
    DATA.keys.forEach(function (key) {
      if (consumed[key] || onlyLegacy && DATA.codecKeys.indexOf(key) < 0) return;
      var value = unit(key,record.values[key]);
      if (value === unit(key,DATA.defaults[key])) delete pending[key]; else pending[key] = value;
    });
    var rules = {};
    Object.keys(record.conditions).forEach(function (key) { rules[key] = copy(record.conditions[key]); rules[key].value = unit(key,rules[key].value); });
    if (!contract.validate(settings)) fail();
    var item = promoteConditions({settings:settings,v2pending:pending,v2conditions:rules});
    if (onlyLegacy && base && base.rules) Object.keys(base.rules).forEach(function (cell) {
      var slot = contract.slots.filter(function (slot) { return slot.slot === Number(cell); })[0];
      if (!slot) return;
      var names = mapping[slot.setting], legacy = slot.side === "shared" ? names && names[0] || slot.setting : names && names[slot.side === "ally" ? 1 : 0];
      if (DATA.codecKeys.indexOf(legacy) < 0) {
        if (!item.rules) item.rules = {};
        item.rules[cell] = copy(base.rules[cell]);
      }
    });
    return item;
  }
  // Pending maps already contain CSS pixels, except v1's raw kill-marker width
  // and pre-level-ticket ultimateTimerSize percentage. Never repeat v2 offsets.
  function promotePending(item, fromVersion) {
    var contract = $.HPColorsV3Settings, source = item.settings, settings = copy(contract.defaults);
    if (!object(source) || !object(source.side) || !object(source.shared)) fail();
    contract.slots.forEach(function (slot) {
      var from = $.HPColorsV3Codec.valuesOf(source,slot);
      if (object(from) && own.call(from,slot.setting))
        $.HPColorsV3Codec.valuesOf(settings,slot)[slot.setting] = from[slot.setting];
    });
    var pending = item.v2pending, boundary = fromVersion <= 2 ? 1 : fromVersion, additions = {};
    (contract.slotAdditions || []).forEach(function (change) {
      if (change.version > boundary) change.slots.forEach(function (slot) { additions[slot] = true; });
    });
    if (pending !== undefined && !object(pending)) fail();
    contract.controls.forEach(function (row) {
      var names = mapping[row.key], key = row.side === "shared" ? names && names[0] || row.key : names && names[row.side === "ally" ? 1 : 0];
      if (!pending || !key || !own.call(pending,key)) return;
      var slot = contract.slots.filter(function (slot) { return slot.side === row.side && slot.setting === row.key; })[0];
      var target = $.HPColorsV3Codec.valuesOf(settings,row);
      // An existing slot can hold a deliberate default: version, not value or
      // sparse presence, decides whether legacy pending may supply that slot.
      var value = key === "ultimateTimerSize" ? pending[key] / 5 : key === "rejuvScale" ? Math.round(pending[key] * 24) / 100 :
        key === "enemyKillMarkerWidth" && fromVersion === 1 ? pending[key] / 10 : pending[key];
      if (additions[slot.slot]) {
        if (!contract.validateValue(row,value)) fail();
        target[row.key] = value;
      }
    });
    if (!contract.validate(settings)) fail();
    // Mapped entries are consumed even when an existing v3 slot wins, so a later
    // save cannot resurrect the conflict. Unmapped future features remain pending.
    contract.controls.forEach(function (row) {
      var names = mapping[row.key], key = row.side === "shared" ? names && names[0] || row.key : names && names[row.side === "ally" ? 1 : 0];
      if (pending && key) delete pending[key];
    });
    if (pending) REMOVED.forEach(function (key) { delete pending[key]; });
    item.settings = settings;
    if (Array.isArray(item.v2scopes)) item.v2scopes.forEach(function (scope) {
      promotePending(scope,fromVersion);
    });
    return item;
  }
  function extension(source) {
    if (source === undefined) return {changed:{},conditions:{},relative:false};
    if (!object(source) || [1,2,3].indexOf(source.v) < 0 || Object.keys(source).length !== 3 || !own.call(source,"conditions")) fail();
    return {changed:pairs(source.values,DATA.extensionKeys),conditions:conditions(source.conditions),relative:source.v >= 2};
  }
  function scope(record) {
    var mode = record.mode || "all", heroes = record.heroes || [];
    if (["all","off","selected","except"].indexOf(mode) < 0 || !Array.isArray(heroes)) fail();
    var seen = {};
    heroes.forEach(function (hero) { if (typeof hero !== "string" || !/^hero_[a-z0-9_]+$/.test(hero) || seen[hero]) fail(); seen[hero] = true; });
    if ((mode === "selected" || mode === "except") && !heroes.length) fail();
    return {mode:mode,heroes:heroes.slice()};
  }
  function preset(source, baseline, relative, wire) {
    if (!object(source) || typeof source.id !== "string" || !source.id || typeof source.name !== "string" || !source.name.trim() || source.name.length > $.HPColorsV3Codec.RECORD.nameMax) fail();
    if (wire && ["baked","user"].indexOf(source.kind) < 0) fail();
    var ext = wire ? extension(source.hpv2) : null;
    var changed = wire ? pairs(source.values,DATA.codecKeys) : source.values;
    if (ext) Object.keys(ext.changed).forEach(function (key) { changed[key] = ext.changed[key]; });
    var record = {id:source.id,name:source.name,values:values(changed,baseline),conditions:conditions(source.conditions),own:source.own,relative:wire ? ext.relative : relative,source:source};
    if (ext) Object.keys(ext.conditions).forEach(function (key) { record.conditions[key] = ext.conditions[key]; });
    var route = scope(source); record.mode = route.mode; record.heroes = route.heroes;
    if (record.mode === "off" && (!wire || source.kind === "user")) record.mode = "all";
    offsets(record,record.relative);
    if (wire && source.kind === "baked") {
      if (source.id !== $.HPColorsV3Codec.RECORD.reservedPresetId || record.mode !== "off" || record.heroes.length || Object.keys(record.conditions).length) fail();
      var bakedBase = source.hpv2 && source.hpv2.v >= 2 ? DATA.defaults : DATA.sparseDefaults;
      var historical = {readoutOffsetX:[27,-30],readoutOffsetY:[500,434],enemyPulseReadoutOffsetX:[27],enemyPulseReadoutOffsetY:[500],allyReadoutOffsetX:[-30],allyReadoutOffsetY:[434]};
      if (bakedBase === DATA.defaults) { historical.ultOffsetY = [48]; historical.levelOffsetY = [48]; }
      [{pairs:source.values,keys:DATA.codecKeys},{pairs:source.hpv2 ? source.hpv2.values : [],keys:DATA.extensionKeys}].forEach(function (group) {
        group.pairs.forEach(function (pair) {
          var key = group.keys[pair[0]];
          if (!own.call(historical,key)) return;
          if (pair[1] !== bakedBase[key] && historical[key].indexOf(pair[1]) < 0) fail();
          record.values[key] = bakedBase[key];
        });
      });
      if (bakedBase === DATA.defaults && !source.hpv2.values.some(function (pair) { return DATA.extensionKeys[pair[0]] === "nameRiseWithPips"; })) record.values.nameRiseWithPips = DATA.defaults.nameRiseWithPips;
      DATA.keys.forEach(function (key) { if (record.values[key] !== bakedBase[key]) fail(); });
      record.values = copy(DATA.defaults);
    }
    if (source.own !== undefined && (!Array.isArray(source.own) || source.own.some(function (key) { return typeof key !== "string" || !own.call(DATA.settingMeta,key); }))) fail();
    return record;
  }
  function materialize(records) {
    var base = null, seen = {};
    records.forEach(function (record) {
      if (seen[record.id]) fail(); seen[record.id] = true;
      if (!base && record.mode === "all") base = record.values;
    });
    records.forEach(function (record) {
      if (record.own && (record.mode === "selected" || record.mode === "except")) {
        var full = copy(base || (record.relative ? DATA.defaults : DATA.sparseDefaults));
        record.own.forEach(function (key) { full[key] = record.values[key]; });
        record.values = full;
      }
    });
    return records.map(function (record) {
      var item = mapped(record); item.id = record.id;
      if (item.id === $.HPColorsV3Codec.RECORD.reservedPresetId) {
        do { item.id = "user-v2-" + Date.now().toString(36) + "-" + (++serial); } while (seen[item.id]);
        seen[item.id] = true;
      }
      item.name = record.name; return item;
    });
  }
  function heroRoutes(bundle, records) {
    bundle.heroPresets = {}; bundle.heroDefault = null;
    records.forEach(function (record, index) {
      if (bundle.heroDefault === null && record.mode === "all" && record.source.kind !== "baked") bundle.heroDefault = bundle.presets[index].id;
    });
    $.HPColorsV3Settings.heroes.forEach(function (hero) {
      var winner = -1;
      ["selected", "except", "all"].some(function (mode) {
        for (var i = 0; i < records.length; i++) {
          var record = records[i];
          if (record.mode !== mode || record.source.kind === "baked") continue;
          var listed = record.heroes.indexOf(hero.key) >= 0;
          if (mode === "selected" && !listed || mode === "except" && listed) continue;
          winner = i; return true;
        }
        return false;
      });
      if (winner >= 0) bundle.heroPresets[hero.key] = bundle.presets[winner].id;
    });
  }
  function session(body, relative) {
    if (!object(body) || body.version !== 1 || !object(body.values)) fail();
    var rows = body.userPresets || [];
    if (!Array.isArray(rows) || rows.length > $.HPColorsV3Codec.RECORD.maxPresets) fail();
    var records = rows.map(function (row) { return preset(row,DATA.sparseDefaults,relative,false); });
    var active = {values:values(body.values,DATA.sparseDefaults),conditions:conditions(body.conditions)};
    if (body.scopes !== undefined && !Array.isArray(body.scopes)) fail();
    var scopes = (body.scopes || []).map(function (row) {
      if (!object(row)) fail(); var route = scope(row);
      return {id:row.id,sourcePresetId:row.sourcePresetId,mode:route.mode,heroes:route.heroes,values:values(row.values,DATA.sparseDefaults),conditions:conditions(row.conditions)};
    });
    for (var i=0;i<scopes.length;i++) if (scopes[i].id === "scope_current" || scopes[i].mode === "all") { active = scopes[i]; break; }
    offsets(active,relative); var bundle = mapped(active); bundle.presets = materialize(records);
    heroRoutes(bundle, records);
    if (active.id === "scope_current") {
      bundle.sourcePresetId = null;
      bundle.sourceWasMapped = active.mode === "selected" || active.mode === "except";
      records.some(function (record, index) {
        if (record.id !== active.sourcePresetId) return false;
        bundle.sourcePresetId = bundle.presets[index].id;
        return true;
      });
    }
    ["hiddenBakedPresetIds","bakedPresetNameOverrides","nextUserPresetNumber"].forEach(function (key) { if (own.call(body,key)) bundle[key] = copy(body[key]); });
    bundle.v2scopes = scopes.filter(function (row) { return row.id !== "scope_current"; }).map(function (row) { if (row !== active) offsets(row,relative); return mapped(row); });
    return bundle;
  }
  function fitForSave(bundle) {
    // Every supported v2 setting now has a v3 slot. Nothing may be dropped to fit.
    if ($.HPColorsV3Codec.encodeRecord(bundle).length > $.HPColorsV3Codec.RECORD.maxChars)
      throw new Error("Save exceeds 192,000 characters; remove some presets");
    return bundle;
  }
  function textPayload(code,prefix,cap) {
    if (typeof code !== "string") fail();
    var text = code.trim(); if (text.length > cap) throw new Error("That v2 code exceeds the import size limit.");
    if (text.slice(0,prefix.length) !== prefix) fail();
    try { return JSON.parse(text.slice(prefix.length)); } catch (_) { fail(); }
  }
  function settingsCode(code,base) {
    var payload = textPayload(code,"HPCR2",$.HPColorsV3Codec.RECORD.settingsCodeChars), bare = Array.isArray(payload);
    if (!bare && (!object(payload) || !own.call(payload,"v") || !own.call(payload,"c") || Object.keys(payload).some(function (key) { return ["v","c","hpv2"].indexOf(key) < 0; }))) fail();
    var ext = extension(bare ? undefined : payload.hpv2), changed = pairs(bare ? payload : payload.v,DATA.codecKeys);
    Object.keys(ext.changed).forEach(function (key) { changed[key] = ext.changed[key]; });
    var record = {values:values(changed,DATA.codecDefaults),conditions:conditions(bare ? null : payload.c)};
    Object.keys(ext.conditions).forEach(function (key) { record.conditions[key] = ext.conditions[key]; });
    offsets(record,ext.relative,bare || payload.hpv2 === undefined);
    var converted = mapped(record,base,bare || payload.hpv2 === undefined);
    return {settings:converted.settings,rules:converted.rules || {},metadata:{v2pending:converted.v2pending},message:""};
  }
  function bundleCode(code) {
    var payload = textPayload(code,"HPCRP1",$.HPColorsV3Codec.RECORD.bundleCodeChars);
    if (!object(payload) || !Array.isArray(payload.records) || !payload.records.length || payload.records.length > $.HPColorsV3Codec.RECORD.maxPresets) fail();
    var records = payload.records.map(function (row) { return preset(row,DATA.codecDefaults,false,true); });
    var presets = materialize(records), selected = 0;
    if (payload.selectedPresetId) {
      selected = records.map(function (record) { return record.id; }).indexOf(payload.selectedPresetId); if (selected < 0) fail();
    }
    var active = presets[selected], bundle = {settings:copy(active.settings),presets:presets,v2pending:copy(active.v2pending)};
    if (active.rules) bundle.rules = copy(active.rules);
    heroRoutes(bundle, records);
    if (records[selected].mode !== "off") {
      bundle.sourcePresetId = active.id;
      bundle.sourceWasMapped = records[selected].mode === "selected" || records[selected].mode === "except";
    }
    if (payload.hiddenBakedPresetIds !== undefined) bundle.hiddenBakedPresetIds = copy(payload.hiddenBakedPresetIds);
    fitForSave(bundle);
    return {settings:bundle.settings,bundle:bundle,message:""};
  }
  function classify(record) {
    if (record === null || record === undefined) return {kind:"absent"};
    try {
      var envelope = $.HPColorsV3Codec.decodeLegacyRecord(record);
      if (!object(envelope) || envelope.m !== "HPV2STORE" || typeof envelope.s !== "number" || Math.floor(envelope.s) !== envelope.s) fail();
      if (envelope.s > 5) return {kind:"newer",message:"Save from a newer version"};
      var body = envelope.s === 1 ? JSON.parse(envelope.b) : envelope.b;
      if (envelope.s < 1 || envelope.s > 5 || !object(body) || body.version !== 1 || !object(body.values)) fail();
    } catch (_) { return {kind:"corrupt"}; }
    try {
      var fitted = fitForSave(session(body,envelope.s >= 4));
      return {kind:"valid",bundle:fitted,migrated:true,message:""};
    } catch (error) {
      return {kind:"conversion_error",message:"V2 save could not be converted: " + $.HPColorsV3Codec.errorMessage(error)};
    }
  }
  $.HPColorsV3FromV2 = Object.freeze({classifyRecord:classify,importSettingsCode:settingsCode,importBundleCode:bundleCode,promotePending:promotePending,promoteConditions:promoteConditions});
})();
