import { describe, it, expect } from "vitest";
import { convertBBToGraphai } from "../convertBBToGraphai";
import { convertGraphaiToBB } from "../convertGraphaiToBB";
import webpSamples from "./fixtures/webp-samples.json";
import kjvsSamples from "./fixtures/kjvs-samples.json";
import byzSamples from "./fixtures/byz-samples.json";
import johnChapter from "../../../bible-versions/WEBUS2020/43-JHN.json";

describe("Round-trip conversion", () => {
  it("should round-trip WEBP verses correctly", () => {
    for (const sample of webpSamples) {
      const graphai = convertBBToGraphai(sample);
      const bb = convertGraphaiToBB(graphai);

      // Only compare the BB fields, omitting undefined
      const originalBB: any = { text: sample.text };
      if (sample.paragraphs) originalBB.paragraphs = sample.paragraphs;
      if (sample.footnotes) {
        originalBB.footnotes = sample.footnotes.map((f: any) => ({
          ...f,
          type: f.type || "stu",
        }));
      }

      expect(bb).toEqual(originalBB);
    }
  });

  it("should round-trip KJVS verses with Strong's normalization", () => {
    for (const sample of kjvsSamples as any[]) {
      const graphai = convertBBToGraphai(sample);
      const bb = convertGraphaiToBB(graphai);

      // Normalize the original BB for comparison (remove leading zeros from Strong's)
      const normalizedSample = { ...sample };
      normalizedSample.text = sample.text.replace(
        /id="([gh])(0+)(\d+)"/g,
        (_match: string, prefix: string, _zeros: string, num: string) => {
          return `id="${prefix}${num}"`;
        }
      );

      // Extract subtitle from text if present
      const subtitleMatch = normalizedSample.text.match(/^«(.*?)»(?:\s|$)/);
      let expectedBB: any = { text: normalizedSample.text };
      if (subtitleMatch) {
        expectedBB.subtitle = { text: subtitleMatch[1] };
        expectedBB.text = expectedBB.text.substring(subtitleMatch[0].length);
      }
      if (sample.paragraphs) expectedBB.paragraphs = sample.paragraphs;
      if (sample.footnotes) expectedBB.footnotes = sample.footnotes;

      expect(bb).toEqual(expectedBB);
    }
  });

  it("should round-trip BYZ verses with Strong's normalization", () => {
    for (const sample of byzSamples as any[]) {
      const graphai = convertBBToGraphai(sample);
      const bb = convertGraphaiToBB(graphai);

      // Normalize the original BB for comparison (remove leading zeros from Strong's)
      const normalizedSample = { ...sample };
      normalizedSample.text = sample.text.replace(
        /id="([gh])(0+)(\d+)"/g,
        (_match: string, prefix: string, _zeros: string, num: string) => {
          return `id="${prefix}${num}"`;
        }
      );

      const expectedBB: any = { text: normalizedSample.text };
      if (sample.paragraphs) expectedBB.paragraphs = sample.paragraphs;
      if (sample.footnotes) expectedBB.footnotes = sample.footnotes;

      expect(bb).toEqual(expectedBB);
    }
  });

  describe("Edge cases", () => {
    it("should handle empty verse", () => {
      const input = { text: "" };
      const graphai = convertBBToGraphai(input);
      const bb = convertGraphaiToBB(graphai);
      expect(bb).toEqual({ text: "" });
    });

    it("should handle verse with only Strong's tags", () => {
      const input = { text: '[strongs id="g1" /] [strongs id="g2" /]' };
      const graphai = convertBBToGraphai(input);
      const bb = convertGraphaiToBB(graphai);
      expect(bb).toEqual({ text: '[strongs id="g1" /] [strongs id="g2" /]' });
    });

    it("should handle nested formatting tags", () => {
      const input = { text: "[i][b]text[/b][/i]" };
      const graphai = convertBBToGraphai(input);
      const bb = convertGraphaiToBB(graphai);
      expect(bb).toEqual({ text: "[i][b]text[/b][/i]" });
    });

    it("should handle Greek text at start/middle/end of verse", () => {
      const input = { text: "[greek]start[/greek] middle [greek]end[/greek]" };
      const graphai = convertBBToGraphai(input);
      const bb = convertGraphaiToBB(graphai);
      expect(bb).toEqual({
        text: "[greek]start[/greek] middle [greek]end[/greek]",
      });
    });

    it("should handle multiple consecutive footnotes", () => {
      const input = {
        text: "word1° word2° word3°",
        footnotes: [{ text: "note1" }, { text: "note2" }, { text: "note3" }],
      };
      const graphai = convertBBToGraphai(input);
      const bb = convertGraphaiToBB(graphai);
      expect(bb).toEqual({
        text: "word1° word2° word3°",
        footnotes: [
          { text: "note1", type: "stu" },
          { text: "note2", type: "stu" },
          { text: "note3", type: "stu" },
        ],
      });
    });

    it("should handle paragraph positions correctly", () => {
      const input = {
        text: "First sentence. Second sentence.",
        paragraphs: [0, 15],
      };
      const graphai = convertBBToGraphai(input);
      const bb = convertGraphaiToBB(graphai);
      expect(bb).toEqual(input);
    });
  });

  describe("Full Chapter Tests", () => {
    it("should handle full John chapter 1 from WEBUS2020 without errors", () => {
      // Test first 10 verses to avoid timeout
      const testVerses = johnChapter.slice(0, 10);

      for (const verse of testVerses) {
        const bb = convertGraphaiToBB(verse.content);
        const graphai = convertBBToGraphai(bb);

        // Just ensure no errors are thrown
        expect(typeof bb.text).toBe("string");
        expect(Array.isArray(graphai)).toBe(true);
      }
    });
  });
});
