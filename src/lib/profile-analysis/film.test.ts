import { describe, expect, it } from "vitest";
import {
  buildFilmProfilePromptRows,
  buildFilmScopeProfilePrompt,
} from "@/lib/profile-analysis/film";

describe("film profile analysis prompt helpers", () => {
  it("builds prompt rows only from viewed titles and marks dropped items", () => {
    const rows = buildFilmProfilePromptRows(
      [
        {
          title: "Heat",
          year: "1995",
          director: "Michael Mann",
          genres: "Crime, Thriller",
          actors: "Al Pacino, Robert De Niro",
          isViewed: true,
          viewPercent: 100,
          rating: 5,
          mediaType: "movie",
        },
        {
          title: "Miami Vice",
          year: "2006",
          director: "Michael Mann",
          genres: "Crime, Action",
          actors: "Colin Farrell, Jamie Foxx",
          isViewed: true,
          viewPercent: 60,
          rating: 3.5,
          mediaType: "movie",
        },
        {
          title: "Unwatched",
          year: "2020",
          director: "",
          genres: "",
          actors: "",
          isViewed: false,
          viewPercent: 0,
          rating: null,
          mediaType: "movie",
        },
      ],
      "movie",
    );

    expect(rows).toEqual([
      {
        title: "Heat",
        year: "1995",
        creator: "Michael Mann",
        genres: "Crime, Thriller",
        actors_top: "Al Pacino, Robert De Niro",
        dropped: "false",
        rating: "5",
      },
      {
        title: "Miami Vice",
        year: "2006",
        creator: "Michael Mann",
        genres: "Crime, Action",
        actors_top: "Colin Farrell, Jamie Foxx",
        dropped: "true",
        rating: "3.5",
      },
    ]);
  });

  it("builds a film prompt with critical film-specific rules and csv payload", () => {
    const prompt = buildFilmScopeProfilePrompt(
      [
        {
          title: 'Heat "1995"',
          year: "1995",
          creator: "Michael Mann",
          genres: "Crime, Thriller",
          actors_top: "Al Pacino, Robert De Niro",
          dropped: "false",
          rating: "5",
        },
      ],
      "movie",
    );

    expect(prompt).toContain('You are analyzing a user\'s ACTUAL taste profile for movies');
    expect(prompt).toContain('"creator" = director / key creative authorship signal for the movie');
    expect(prompt).toContain('"actors_top" = main cast; this is a weak supporting signal');
    expect(prompt).toContain("Creator-mode selectivity");
    expect(prompt).toContain('"title","year","creator","genres","actors_top","dropped","rating"');
    expect(prompt).toContain('"Heat ""1995"""');
  });
});
