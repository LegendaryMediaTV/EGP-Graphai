import { describe, it, expect } from "vitest";
import { convertGraphaiToBB } from "../convertGraphaiToBB";

describe("convertGraphaiToBB", () => {
  it("should convert Graphai format to BB format", () => {
    const input = [
      {
        text: "Ἰούδας",
        script: "G",
        strong: "G2455",
        morph: "N-NSM",
      },
      {
        text: " δὲ",
        script: "G",
        strong: "G1161",
        morph: "CONJ",
      },
      {
        text: " ἐγέννησεν",
        script: "G",
        strong: "G1080",
        morph: "V-AAI-3S",
      },
      {
        text: " τὸν",
        script: "G",
        strong: "G3588",
        morph: "T-ASM",
      },
      {
        text: " Φαρὲς",
        script: "G",
        strong: "G5329",
        morph: "N-PRI",
      },
      {
        text: " καὶ",
        script: "G",
        strong: "G2532",
        morph: "CONJ",
      },
      {
        text: " τὸν",
        script: "G",
        strong: "G3588",
        morph: "T-ASM",
      },
      {
        text: " Ζαρὰ",
        script: "G",
        strong: "G2196",
        morph: "N-PRI",
      },
      {
        text: " ἐκ",
        script: "G",
        strong: "G1537",
        morph: "PREP",
      },
      {
        text: " τῆς",
        script: "G",
        strong: "G3588",
        morph: "T-GSF",
      },
      {
        text: " Θάμαρ·",
        script: "G",
        strong: "G2283",
        morph: "N-PRI",
      },
      {
        text: " Φαρὲς",
        script: "G",
        strong: "G5329",
        morph: "N-PRI",
      },
      {
        text: " δὲ",
        script: "G",
        strong: "G1161",
        morph: "CONJ",
      },
      {
        text: " ἐγέννησεν",
        script: "G",
        strong: "G1080",
        morph: "V-AAI-3S",
      },
      {
        text: " τὸν",
        script: "G",
        strong: "G3588",
        morph: "T-ASM",
      },
      {
        text: " Ἑσρώμ·",
        script: "G",
        strong: "G2074",
        morph: "N-PRI",
      },
      {
        text: " Ἑσρὼμ",
        script: "G",
        strong: "G2074",
        morph: "N-PRI",
      },
      {
        text: " δὲ",
        script: "G",
        strong: "G1161",
        morph: "CONJ",
      },
      {
        text: " ἐγέννησεν",
        script: "G",
        strong: "G1080",
        morph: "V-AAI-3S",
      },
      {
        text: " τὸν",
        script: "G",
        strong: "G3588",
        morph: "T-ASM",
      },
      {
        text: " Ἀράμ·",
        script: "G",
        strong: "G689",
        morph: "N-PRI",
      },
    ];

    const expected = {
      text: '[greek]Ἰούδας[/greek] [strongs id="g2455" m="N-NSM" /] [greek]δὲ[/greek] [strongs id="g1161" m="CONJ" /] [greek]ἐγέννησεν[/greek] [strongs id="g1080" m="V-AAI-3S" /] [greek]τὸν[/greek] [strongs id="g3588" m="T-ASM" /] [greek]Φαρὲς[/greek] [strongs id="g5329" m="N-PRI" /] [greek]καὶ[/greek] [strongs id="g2532" m="CONJ" /] [greek]τὸν[/greek] [strongs id="g3588" m="T-ASM" /] [greek]Ζαρὰ[/greek] [strongs id="g2196" m="N-PRI" /] [greek]ἐκ[/greek] [strongs id="g1537" m="PREP" /] [greek]τῆς[/greek] [strongs id="g3588" m="T-GSF" /] [greek]Θάμαρ·[/greek] [strongs id="g2283" m="N-PRI" /] [greek]Φαρὲς[/greek] [strongs id="g5329" m="N-PRI" /] [greek]δὲ[/greek] [strongs id="g1161" m="CONJ" /] [greek]ἐγέννησεν[/greek] [strongs id="g1080" m="V-AAI-3S" /] [greek]τὸν[/greek] [strongs id="g3588" m="T-ASM" /] [greek]Ἑσρώμ·[/greek] [strongs id="g2074" m="N-PRI" /] [greek]Ἑσρὼμ[/greek] [strongs id="g2074" m="N-PRI" /] [greek]δὲ[/greek] [strongs id="g1161" m="CONJ" /] [greek]ἐγέννησεν[/greek] [strongs id="g1080" m="V-AAI-3S" /] [greek]τὸν[/greek] [strongs id="g3588" m="T-ASM" /] [greek]Ἀράμ·[/greek] [strongs id="g689" m="N-PRI" /]',
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle paragraphs and footnotes", () => {
    const input = [
      {
        text: "In the beginning, God",
        foot: {
          type: "trn",
          content: [
            "The Hebrew word rendered “God” is “",
            {
              text: "אֱלֹהִ֑ים",
              script: "H",
            },
            "” (Elohim).",
          ],
        },
        paragraph: true,
      },
      " created the heavens and the earth.",
    ];

    const expected = {
      text: "In the beginning, God° created the heavens and the earth.",
      paragraphs: [0],
      footnotes: [
        {
          type: "trn",
          text: "The Hebrew word rendered “God” is “[hebrew]אֱלֹהִ֑ים[/hebrew]” (Elohim).",
        },
      ],
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle string context nodes and small caps marks", () => {
    const input = [
      {
        text: "These",
        strong: "H0428",
      },
      " ",
      {
        text: "are",
        marks: ["i"],
      },
      {
        text: " the generations",
        strong: "H8435",
      },
      {
        text: " of the heavens",
        strong: "H8064",
      },
      {
        text: " and of the earth",
        strong: "H0776",
      },
      {
        text: " when they were created",
        strong: "H1254",
        morph: "8736",
      },
      {
        text: ", in the day",
        strong: "H3117",
      },
      " that the ",
      {
        text: "Lord",
        marks: ["sc"],
        strong: "H3068",
      },
      {
        text: " God",
        strong: "H0430",
      },
      {
        text: " made",
        strong: "H6213",
        morph: "8800",
      },
      {
        text: " the earth",
        strong: "H0776",
      },
      {
        text: " and the heavens.",
        strong: "H8064",
      },
    ];

    const expected = {
      text: 'These [strongs id="h428" /] [i]are[/i] the generations [strongs id="h8435" /] of the heavens [strongs id="h8064" /] and of the earth [strongs id="h776" /] when they were created [strongs id="h1254" tvm="8736" /], in the day [strongs id="h3117" /] that the [sc]Lord[/sc] [strongs id="h3068" /] God [strongs id="h430" /] made [strongs id="h6213" tvm="8800" /] the earth [strongs id="h776" /] and the heavens. [strongs id="h8064" /]',
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle bold and word of Christ marks", () => {
    const input = [
      "Jesus turned and saw them following, and said to them, ",
      {
        text: "“What are you looking for?”",
        marks: ["woc"],
      },
      " They said to him, “Rabbi” (which is to say, being interpreted, Teacher), “where are ",
      { text: "you", marks: ["b"] },
      " staying?”",
    ];

    const expected = {
      text: "Jesus turned and saw them following, and said to them, [red]“What are you looking for?”[/red] They said to him, “Rabbi” (which is to say, being interpreted, Teacher), “where are [b]you[/b] staying?”",
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle nested marks", () => {
    const input = [
      {
        text: "important bold text",
        marks: ["i", "b"],
      },
    ];

    const expected = {
      text: "[i][b]important bold text[/b][/i]",
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle paragraphs", () => {
    const input = [
      {
        text: "Yahweh God said to the woman, “What have you done?”",
        paragraph: true,
      },
      {
        text: "The woman said, “The serpent deceived me, and I ate.”",
        paragraph: true,
      },
    ];

    const expected = {
      text: "Yahweh God said to the woman, “What have you done?” The woman said, “The serpent deceived me, and I ate.”",
      paragraphs: [0, 51],
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle line breaks", () => {
    const input = [
      {
        text: "Yahweh God said to the serpent,",
        paragraph: true,
        break: true,
      },
      {
        text: "“Because you have done this,",
        break: true,
      },
      {
        text: "you are cursed above all livestock,",
        break: true,
      },
      {
        text: "and above every animal of the field.",
        break: true,
      },
      {
        text: "You shall go on your belly",
        break: true,
      },
      {
        text: "and you shall eat dust all the days of your life.",
        break: true,
      },
    ];

    const expected = {
      text: "Yahweh God said to the serpent,\n“Because you have done this,\nyou are cursed above all livestock,\nand above every animal of the field.\nYou shall go on your belly\nand you shall eat dust all the days of your life.\n",
      paragraphs: [0],
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  it("should handle footnotes with types (WEBP)", () => {
    const input = [
      {
        text: "The light shines",
        foot: {
          type: "trn",
          content: ["Translation note here."],
        },
      },
      "in the darkness.",
    ];

    const expected = {
      text: "The light shines°in the darkness.",
      footnotes: [
        {
          type: "trn",
          text: "Translation note here.",
        },
      ],
    };

    expect(convertGraphaiToBB(input)).toEqual(expected);
  });

  describe("KJVS Strong's and TVM", () => {
    it("should convert Strong's with leading zeros and TVM", () => {
      const input = [
        { text: "the beginning", strong: "G0746" },
        { text: " was", strong: "G2258", morph: "ImpfInd" },
      ];
      const expected = {
        text: 'the beginning [strongs id="g746" /] was [strongs id="g2258" tvm="ImpfInd" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert Hebrew Strong's with numeric TVM", () => {
      const input = [{ text: "sang", strong: "H7891", morph: "8804" }];
      const expected = {
        text: 'sang [strongs id="h7891" tvm="8804" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should concatenate text elements", () => {
      const input = [
        "In the beginning ",
        { text: "was", strong: "G2258", morph: "ImpfInd" },
        " the Word",
      ];
      const expected = {
        text: 'In the beginning was [strongs id="g2258" tvm="ImpfInd" /] the Word',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should handle TVM2 morphology codes", () => {
      const input = [
        { text: "word", strong: "G0373", morph: "PresMidInd/PresMidImpr" },
      ];
      const expected = {
        text: 'word [strongs id="g373" tvm="PresMidInd" tvm2="PresMidImpr" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert Strong's case without removing leading zeros", () => {
      const input = [
        { text: "beginning", strong: "G0746" },
        " ",
        { text: "word", strong: "G0001" },
      ];
      const expected = {
        text: 'beginning [strongs id="g746" /] word [strongs id="g1" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should select morphology attributes based on format", () => {
      const input = [
        { text: "greek", script: "G", strong: "G3056", morph: "N-NSM" }, // hyphenated → m
        { text: "hebrew", script: "H", strong: "H01234", morph: "8675" }, // numeric → tvm
        { text: "tvm", strong: "G373", morph: "PresMidInd" }, // mixed case → tvm
      ];
      const expected = {
        text: '[greek]greek[/greek] [strongs id="g3056" m="N-NSM" /][hebrew]hebrew[/hebrew] [strongs id="h1234" tvm="8675" /]tvm [strongs id="g373" tvm="PresMidInd" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert Greek text with Strong's to BB format", () => {
      const input = [
        { text: "λόγος", script: "G", strong: "G3056", morph: "N-NSM" },
      ];
      const expected = {
        text: '[greek]λόγος[/greek] [strongs id="g3056" m="N-NSM" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert paragraphs to BB format", () => {
      const input = [
        { text: "First sentence.", paragraph: true },
        { text: "Second sentence.", paragraph: true },
      ];
      const expected = {
        text: "First sentence. Second sentence.",
        paragraphs: [0, 15],
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert line breaks to BB format", () => {
      const input = [{ text: "First line", break: true }, "Second line"];
      const expected = {
        text: "First line\nSecond line",
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert headings to BB tags", () => {
      const input = [
        { heading: [{ text: "Chapter 1" }] },
        { text: "Some content" },
      ];
      const expected = {
        text: "[heading]Chapter 1[/heading]Some content",
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should strip leading zeros from Strong's numbers", () => {
      const input = [{ text: "word", strong: "G0746" }];
      const expected = {
        text: 'word [strongs id="g746" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should handle single-digit Strong's numbers", () => {
      const input = [{ text: "word", strong: "G1" }];
      const expected = {
        text: 'word [strongs id="g1" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should preserve punctuation inside script tags", () => {
      const input = [{ text: "λόγος,", script: "G" }];
      const expected = {
        text: "[greek]λόγος,[/greek]",
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should handle consecutive Strong's tags (no text on second)", () => {
      const input = [
        { text: "the Benjamite", strong: "H1121" },
        { strong: "H1145" },
      ];
      const expected = {
        text: 'the Benjamite [strongs id="h1121" /] [strongs id="h1145" /]',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should handle Strong's at start (no text)", () => {
      const input = [{ strong: "G1722" }, " the beginning"];
      const expected = {
        text: '[strongs id="g1722" /] the beginning',
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should preserve supplied words as literal text", () => {
      const input = ["He [was] in the world"];
      const expected = {
        text: "He [was] in the world",
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should preserve curly quotes", () => {
      const input = ["\u201cWhat have you done?\u201d"];
      const expected = {
        text: "\u201cWhat have you done?\u201d",
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should recursively convert footnote content", () => {
      const input = [
        {
          text: "word",
          foot: {
            content: [
              "The Greek word ",
              { text: "κατέλαβεν", script: "G" },
              " means...",
            ],
          },
        },
      ];
      const expected = {
        text: "word°",
        footnotes: [
          { text: "The Greek word [greek]κατέλαβεν[/greek] means..." },
        ],
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should handle multiple footnotes with types", () => {
      const input = [
        { text: "word1", foot: { content: ["note1"] } },
        { text: " word2", foot: { type: "var", content: ["note2"] } },
        " word3",
      ];
      const expected = {
        text: "word1° word2° word3",
        footnotes: [{ text: "note1" }, { type: "var", text: "note2" }],
      };
      expect(convertGraphaiToBB(input)).toEqual(expected);
    });
  });

  describe("Subtitles", () => {
    it("should convert subtitle object to BB format", () => {
      const input = [
        {
          subtitle: [
            { text: "A Psalm", strong: "H4210" },
            { text: " of David", strong: "H1732" },
            ".",
          ],
        },
        { text: "O LORD", strong: "H3068" },
        { text: " my God", strong: "H430" },
        ".",
      ];

      const expected = {
        subtitle: {
          text: 'A Psalm [strongs id="h4210" /] of David [strongs id="h1732" /].',
        },
        text: 'O LORD [strongs id="h3068" /] my God [strongs id="h430" /].',
      };

      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert simple subtitle string to BB format", () => {
      const input = [
        { subtitle: "A Psalm of David." },
        { text: "O LORD", strong: "H3068" },
        { text: " my God", strong: "H430" },
        ".",
      ];

      const expected = {
        subtitle: {
          text: "A Psalm of David.",
        },
        text: 'O LORD [strongs id="h3068" /] my God [strongs id="h430" /].',
      };

      expect(convertGraphaiToBB(input)).toEqual(expected);
    });

    it("should convert subtitle with footnotes to BB format", () => {
      const input = [
        {
          subtitle: [
            {
              text: "A Psalm",
              strong: "H4210",
              foot: { content: "A musical term", type: "stu" },
            },
            { text: " of David", strong: "H1732" },
            ".",
          ],
        },
        { text: "O LORD", strong: "H3068" },
      ];

      const expected = {
        subtitle: {
          text: 'A Psalm [strongs id="h4210" /]° of David [strongs id="h1732" /].',
          footnotes: [{ text: "A musical term", type: "stu" }],
        },
        text: 'O LORD [strongs id="h3068" /]',
      };

      expect(convertGraphaiToBB(input)).toEqual(expected);
    });
  });
});
