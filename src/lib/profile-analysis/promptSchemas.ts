export const FILM_PROFILE_ANALYSIS_JSON_SCHEMA = `{
  "user_profile_uk": {
    "summary": "Short user-facing Ukrainian summary of the taste profile. 3-5 sentences. Clear, natural, not poetic.",
    "likes": [
      "3 to 6 concise Ukrainian bullets about what usually works well for the user"
    ],
    "dislikes": [
      "3 to 6 concise Ukrainian bullets about what usually works worse for the user"
    ],
    "watching_patterns": [
      "2 to 5 concise Ukrainian bullets about observable viewing patterns"
    ],
    "strong_author_signals": [
      "2 to 5 concise Ukrainian bullets about strong creator or director matches, only if clearly supported"
    ],
    "confidence_label_uk": "Низька | Середня | Висока",
    "confidence_reason_uk": "Short Ukrainian explanation of profile reliability based on data volume and consistency"
  },
  "system_profile_en": {
    "profile_summary": "Compact English summary suitable for reuse in future recommendation prompts",
    "core_preferences": [
      "Short English points"
    ],
    "negative_patterns": [
      "Short English points"
    ],
    "taste_axes": [
      {
        "axis": "Name of preference axis in English",
        "value": "low | medium | high",
        "evidence": ["Title A", "Title B"]
      }
    ],
    "strong_creator_affinities": [
      "Creator or director name with a short English note, only if clearly supported by multiple titles"
    ],
    "creator_signals": [
      "Short English observations only if supported by data"
    ],
    "actor_signals": [
      "Short English observations only if clearly supported by repeated evidence across multiple titles"
    ],
    "representative_likes": ["Title A", "Title B", "Title C"],
    "representative_dislikes": ["Title X", "Title Y", "Title Z"],
    "contradictions": [
      "Short English notes about mixed or conflicting signals"
    ],
    "confidence": {
      "label": "low | medium | high",
      "reason": "Short English explanation"
    },
    "evidence": {
      "positive_titles": ["Title A", "Title B"],
      "negative_titles": ["Title X", "Title Y"],
      "mixed_titles": ["Title M", "Title N"]
    }
  }
}`;

export const GAME_PROFILE_ANALYSIS_JSON_SCHEMA = `{
  "user_profile_uk": {
    "summary": "Short user-facing Ukrainian summary of the taste profile. 3-5 sentences. Clear, natural, not poetic.",
    "likes": [
      "3 to 6 concise Ukrainian bullets about what usually works well for the user"
    ],
    "dislikes": [
      "3 to 6 concise Ukrainian bullets about what usually works worse for the user"
    ],
    "playing_patterns": [
      "2 to 5 concise Ukrainian bullets about observable play patterns"
    ],
    "franchise_signals_uk": [
      "2 to 5 concise Ukrainian bullets about clear franchise or series-level affinities, only if strongly supported"
    ],
    "confidence_label_uk": "Низька | Середня | Висока",
    "confidence_reason_uk": "Short Ukrainian explanation of profile reliability based on data volume and consistency"
  },
  "system_profile_en": {
    "profile_summary": "Compact English summary suitable for reuse in future recommendation prompts",
    "core_preferences": [
      "Short English points"
    ],
    "negative_patterns": [
      "Short English points"
    ],
    "experience_signals": [
      "Short English observations about preferred experience type, only if clearly supported"
    ],
    "playstyle_signals": [
      "Short English observations about preferred gameplay style, only if clearly supported"
    ],
    "taste_axes": [
      {
        "axis": "Name of preference axis in English",
        "value": "low | medium | high",
        "evidence": ["Title A", "Title B"]
      }
    ],
    "genre_signals": [
      "Short English observations only if supported by repeated evidence"
    ],
    "franchise_affinities": [
      "Franchise name with a short English note, only if clearly supported by multiple titles"
    ],
    "representative_likes": ["Title A", "Title B", "Title C"],
    "representative_dislikes": ["Title X", "Title Y", "Title Z"],
    "contradictions": [
      "Short English notes about mixed or conflicting signals"
    ],
    "confidence": {
      "label": "low | medium | high",
      "reason": "Short English explanation"
    },
    "evidence": {
      "positive_titles": ["Title A", "Title B"],
      "negative_titles": ["Title X", "Title Y"],
      "mixed_titles": ["Title M", "Title N"]
    }
  }
}`;
