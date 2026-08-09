#!/usr/bin/env python3
import re
import sys

from active import get_record_name, iter_record_spans


EVERYONE_RECORDS = {
    "ability_bookworm_knightcharge",
    "ability_nano_catform",
    "ability_priest_knockback",
    "ability_punkgoat_blasted",
    "ability_unicorn_luminousstrike",
    "ability_werewolf_transformation",
    "citadel_ability_bull_charge",
    "citadel_ability_uppercut",
    "synth_barrage",
    "upgrade_berserker",
    "upgrade_colossus",
    "upgrade_enchanted_holsters",
    "upgrade_kinetic_sash",
    "upgrade_mystic_regeneration",
    "upgrade_proc_silence",
    "upgrade_resonant_healing",
    "upgrade_self_bubble",
    "upgrade_shadow_strike",
    "upgrade_siphon_bullets",
    "upgrade_tech_overflow",
    "vanguard_aoe_buff",
}

CASTER_ONLY_RECORDS = {
    "ability_drifter_hunger",
    "ability_punkgoat_ult",
    "ability_stacking_damage",
    "ability_viper_venom",
    "citadel_ability_hook",
    "citadel_ability_shiv_dash",
    "drifter_darkness",
    "upgrade_arctic_blast",
    "upgrade_cold_front",
    "upgrade_inhibitor",
    "upgrade_nullification_aura",
    "upgrade_shivas_bracelet",
    "upgrade_spellslinger_headshots",
    "upgrade_tech_defense_shredders",
    "upgrade_toxic_bullets",
}

OVERHEAD_EVERYONE = "OVERHEAD_DRAW_FOR_EVERYONE"
OVERHEAD_CASTER_ONLY = "OVERHEAD_DRAW_FOR_CASTER_ONLY"
OVERHEAD_CASTER_TEAM_ONLY = "OVERHEAD_DRAW_FOR_CASTER_TEAM_ONLY"


def _status_fields(overhead, icon=None, hud=None):
    fields = {
        "m_bIsHidden": "false",
        "m_eDrawOverheadStatus": f'"{overhead}"',
        "m_eModifierDisplayLocaiton": '"MODIFIER_DISPLAY_HEALTHBAR"',
    }
    if icon is not None:
        fields["m_strSmallIconCssClass"] = f'"{icon}"'
    if hud is not None:
        fields["m_eHudDisplayLocation"] = f'"{hud}"'
    return fields


SPECIAL_MODIFIERS = {
    "citadel_ability_melee_parry": [
        (
            '_my_subclass_name = "parry_cooldown_display"',
            _status_fields(OVERHEAD_EVERYONE, "disarm_proc", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_boxing_glove": [
        (
            '_my_subclass_name = "modifier_slow_base"',
            _status_fields(OVERHEAD_CASTER_ONLY, "slowed", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_bullet_resist_shredder": [
        (
            '_my_subclass_name = "modifier_bullet_armor_shredder"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "bullet_armor_reduction",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_capacitor": [
        (
            '_my_subclass_name = "modifier_weapon_capacitor_slow"',
            _status_fields(OVERHEAD_CASTER_ONLY, "slowed", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_cloaking_device_active": [
        (
            '_my_subclass_name = "modifier_cloaking_device_active_ambush"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "cloaking_device_active_ambush",
                "DISPLAY_HUD_NONE",
            ),
        ),
        (
            '_my_subclass_name = "modifier_invis"',
            _status_fields(OVERHEAD_CASTER_ONLY, "upgrade_cloaking_device"),
        ),
    ],
    "upgrade_close_quarter_combat": [
        (
            '_my_subclass_name = "modifier_slow_base"',
            _status_fields(OVERHEAD_CASTER_ONLY, "slowed", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_dps_aura": [
        (
            '_my_subclass_name = "modifier_dps_aura_active"',
            _status_fields(OVERHEAD_EVERYONE, "dps_aura", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_fervor": [
        (
            '_my_subclass_name = "modifier_fervor_bonuses"',
            _status_fields(OVERHEAD_EVERYONE, "fervor_aura", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_fleetfoot_boots": [
        (
            '_my_subclass_name = "modifier_fleetfoot_boots"',
            _status_fields(
                OVERHEAD_EVERYONE,
                "fleetfoot_boots",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_fury_trance": [
        (
            '_my_subclass_name = "active"',
            _status_fields(OVERHEAD_EVERYONE, "surging_power_active"),
        ),
    ],
    "upgrade_glitch": [
        (
            '_my_subclass_name = "modifier_glitch_debuff"',
            _status_fields(OVERHEAD_CASTER_TEAM_ONLY, "glitched"),
        ),
        (
            '_my_subclass_name = "modifier_glitch_self_penalty"',
            _status_fields(OVERHEAD_CASTER_ONLY, "glitched"),
        ),
    ],
    "upgrade_greater_withering_whip": [
        (
            '_my_subclass_name = "upgrade_greater_withering_whip_debuff"',
            _status_fields(OVERHEAD_CASTER_TEAM_ONLY, "disarm_proc"),
        ),
    ],
    "upgrade_healbane": [
        (
            '_my_subclass_name = "modifier_healbane_debuff"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "escalating_exposure",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_health_nova": [
        (
            '_my_subclass_name = "modifier_healing_Nova_active"',
            _status_fields(OVERHEAD_EVERYONE, "health_nova", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_health_stimpak": [
        (
            '_my_subclass_name = "modifier_stimpak_regen"',
            _status_fields(OVERHEAD_EVERYONE, "stimpak"),
        ),
    ],
    "upgrade_hollow_point_rounds": [
        (
            '_my_subclass_name = "modifier_bullet_armor_shredder"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "bullet_armor_reduction",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_juggernaut": [
        (
            '_my_subclass_name = "juggeranut_firerate_slow"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "juggernaut",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_magic_carpet": [
        (
            '_my_subclass_name = "modifier_magiccarpet_flying"',
            _status_fields(OVERHEAD_EVERYONE, "upgrade_magic_carpet"),
        ),
    ],
    "upgrade_metal_skin": [
        (
            '_my_subclass_name = "modifier_citadel_metal_skin"',
            _status_fields(OVERHEAD_EVERYONE, "metal_skin", "DISPLAY_HUD_NONE"),
        ),
    ],
    "upgrade_phantom_strike": [
        (
            '_my_subclass_name = "modifier_slow_base"',
            _status_fields(OVERHEAD_CASTER_TEAM_ONLY, "disarm_proc"),
        ),
    ],
    "upgrade_spirit_burn": [
        (
            '_my_subclass_name = "modifier_spirit_burn_enemy_tracker"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "escalating_exposure",
                "DISPLAY_HUD_NONE",
            ),
        ),
        (
            '_my_subclass_name = "modifier_spirit_burn_dot"',
            _status_fields(
                OVERHEAD_EVERYONE,
                "escalating_exposure",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_target_stun": [
        (
            '_my_subclass_name = "modifier_citadel_delayed_stun"',
            _status_fields(OVERHEAD_EVERYONE, "delayed_stun"),
        ),
    ],
    "upgrade_tech_overflow": [
        (
            'm_sLocalizationName = "modifier_tech_overflow_building"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "tech_overflow_buildup",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_thermal_detonator": [
        (
            '_my_subclass_name = "modifier_citadel_thermal_detonator_debuff"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "bullet_armor_reduction",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
    "upgrade_unstoppable": [
        (
            '_my_subclass_name = "modifier_unstoppable"',
            _status_fields(OVERHEAD_EVERYONE, "upgrade_self_buff_modifier"),
        ),
    ],
    "upgrade_weapon_backstabber": [
        (
            '_my_subclass_name = "modifier_backstabber_debuff"',
            _status_fields(
                OVERHEAD_CASTER_ONLY,
                "bullet_armor_reduction",
                "DISPLAY_HUD_NONE",
            ),
        ),
    ],
}

SUPPRESSED_HEALTHBAR_MODIFIERS = {
    "upgrade_colossus": [
        '_my_subclass_name = "modifier_colossus_active"',
    ],
    "upgrade_proc_silence": [
        '_my_subclass_name = "modifier_citadel_silence_proc_tech_damage_reduction"',
    ],
}

FIELD_PATTERN = re.compile(r"^(?P<indent>[ \t]*)(?P<name>m_[A-Za-z0-9_]+)\s*=", re.MULTILINE)


def _line_indent(line):
    return line[: len(line) - len(line.lstrip())]


def _modifier_span(lines, marker):
    hits = [index for index, line in enumerate(lines) if marker in line]
    if len(hits) != 1:
        raise ValueError(f"Expected one modifier marker {marker!r}, found {len(hits)}")

    marker_index = hits[0]
    marker_indent = _line_indent(lines[marker_index])
    start = next(
        index
        for index in range(marker_index - 1, -1, -1)
        if lines[index].strip() == "{" and len(_line_indent(lines[index])) < len(marker_indent)
    )
    open_indent = _line_indent(lines[start])
    end = next(
        index
        for index in range(marker_index + 1, len(lines))
        if lines[index].lstrip().startswith("}") and _line_indent(lines[index]) == open_indent
    )
    return start, end, marker_indent


def _set_modifier_fields(record, marker, desired_fields):
    lines = record.splitlines(keepends=True)
    start, end, field_indent = _modifier_span(lines, marker)
    newline = "\r\n" if any(line.endswith("\r\n") for line in lines) else "\n"
    changes = 0

    for field_name, field_value in desired_fields.items():
        matches = []
        for index in range(start + 1, end):
            match = FIELD_PATTERN.match(lines[index].rstrip("\r\n"))
            if match and match.group("indent") == field_indent and match.group("name") == field_name:
                matches.append(index)

        if len(matches) > 1:
            raise ValueError(f"Modifier {marker!r} has duplicate direct field {field_name}")

        desired_line = f"{field_indent}{field_name} = {field_value}{newline}"
        if matches:
            index = matches[0]
            if lines[index] != desired_line:
                lines[index] = desired_line
                changes += 1
        else:
            lines.insert(end, desired_line)
            end += 1
            changes += 1

    return "".join(lines), changes


def _suppress_modifier_healthbar(record, marker):
    record, changes = _set_modifier_fields(
        record,
        marker,
        {"m_eDrawOverheadStatus": '"OVERHEAD_DRAW_NEVER"'},
    )
    lines = record.splitlines(keepends=True)
    start, end, field_indent = _modifier_span(lines, marker)
    matches = []
    for index in range(start + 1, end):
        match = FIELD_PATTERN.match(lines[index].rstrip("\r\n"))
        if (
            match
            and match.group("indent") == field_indent
            and match.group("name") == "m_eModifierDisplayLocaiton"
        ):
            matches.append(index)

    if len(matches) > 1:
        raise ValueError(f"Modifier {marker!r} has duplicate direct healthbar fields")
    if matches:
        del lines[matches[0]]
        changes += 1
    return "".join(lines), changes


def _overhead_value(record_name, modifier_block):
    if record_name == "upgrade_arcane_surge":
        if 'modifier_arcane_surge_ability_watcher' in modifier_block:
            return "OVERHEAD_DRAW_FOR_CASTER_ONLY"
        if 'modifier_kinetic_sash_triggered' in modifier_block:
            return "OVERHEAD_DRAW_FOR_EVERYONE"
        raise ValueError("Unknown Arcane Surge healthbar modifier")
    if record_name in EVERYONE_RECORDS:
        return "OVERHEAD_DRAW_FOR_EVERYONE"
    if record_name in CASTER_ONLY_RECORDS:
        return "OVERHEAD_DRAW_FOR_CASTER_ONLY"
    raise ValueError(f"Unclassified healthbar modifier in {record_name}")


def _add_missing_healthbar_overhead(record_name, record):
    lines = record.splitlines(keepends=True)
    newline = "\r\n" if any(line.endswith("\r\n") for line in lines) else "\n"
    changes = 0

    healthbar_indexes = [
        index
        for index, line in enumerate(lines)
        if line.strip() == 'm_eModifierDisplayLocaiton = "MODIFIER_DISPLAY_HEALTHBAR"'
    ]

    for healthbar_index in reversed(healthbar_indexes):
        field_indent = _line_indent(lines[healthbar_index])
        start = next(
            index
            for index in range(healthbar_index - 1, -1, -1)
            if lines[index].strip() == "{" and len(_line_indent(lines[index])) < len(field_indent)
        )
        open_indent = _line_indent(lines[start])
        end = next(
            index
            for index in range(healthbar_index + 1, len(lines))
            if lines[index].lstrip().startswith("}") and _line_indent(lines[index]) == open_indent
        )
        direct_overhead = [
            index
            for index in range(start + 1, end)
            if _line_indent(lines[index]) == field_indent
            and lines[index].lstrip().startswith("m_eDrawOverheadStatus =")
        ]
        if len(direct_overhead) > 1:
            raise ValueError(f"Duplicate direct overhead fields in {record_name}")
        if direct_overhead:
            continue

        modifier_block = "".join(lines[start : end + 1])
        overhead_value = _overhead_value(record_name, modifier_block)
        lines.insert(
            healthbar_index + 1,
            f'{field_indent}m_eDrawOverheadStatus = "{overhead_value}"{newline}',
        )
        changes += 1

    return "".join(lines), changes


def apply_healthbar_status_overrides(content, require_special_records=True):
    updated = []
    cursor = 0
    changes = 0
    seen_special_records = set()
    seen_suppressed_records = set()

    for start, end, record in iter_record_spans(content):
        record_name = get_record_name(record)
        updated.append(content[cursor:start])

        if record_name in SPECIAL_MODIFIERS:
            for marker, desired_fields in SPECIAL_MODIFIERS[record_name]:
                record, modifier_changes = _set_modifier_fields(
                    record,
                    marker,
                    desired_fields,
                )
                changes += modifier_changes
            seen_special_records.add(record_name)

        if record_name in SUPPRESSED_HEALTHBAR_MODIFIERS:
            for marker in SUPPRESSED_HEALTHBAR_MODIFIERS[record_name]:
                record, modifier_changes = _suppress_modifier_healthbar(record, marker)
                changes += modifier_changes
            seen_suppressed_records.add(record_name)

        record, overhead_changes = _add_missing_healthbar_overhead(record_name, record)
        changes += overhead_changes
        updated.append(record)
        cursor = end

    updated.append(content[cursor:])

    if require_special_records:
        missing = set(SPECIAL_MODIFIERS) - seen_special_records
        if missing:
            raise ValueError(f"Missing required status override records: {sorted(missing)}")

        missing = set(SUPPRESSED_HEALTHBAR_MODIFIERS) - seen_suppressed_records
        if missing:
            raise ValueError(f"Missing required status suppression records: {sorted(missing)}")

    return "".join(updated), changes


def patch_file(file_path, output_path=None):
    with open(file_path, "r", encoding="utf-8", newline="") as source:
        content = source.read()

    updated, changes = apply_healthbar_status_overrides(content)
    target = output_path or file_path
    with open(target, "w", encoding="utf-8", newline="") as destination:
        destination.write(updated)

    print(f"Healthbar status overrides: {changes} field(s) modified. Output -> {target}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python apply_healthbar_status_overrides.py <input_file> [output_file]")
        sys.exit(1)
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    patch_file(input_path, output_path)
