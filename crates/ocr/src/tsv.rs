//! Tesseract TSV Output Parser and Data Structures

use serde::{Deserialize, Serialize};

/// Bounding box representation for an individual recognized word token.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OcrBoundingBox {
    pub x0: i32,
    pub y0: i32,
    pub x1: i32,
    pub y1: i32,
    pub conf: f64,
    pub word: String,
}

/// Consolidated OCR output containing aggregated line text and bounding boxes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OcrResult {
    pub text: String,
    pub boxes: Vec<OcrBoundingBox>,
}

/// Parses raw TSV output from `tesseract <image> stdout tsv` into structured `OcrResult`.
///
/// TSV Header format:
/// level | page_num | block_num | par_num | line_num | word_num | left | top | width | height | conf | text
pub fn parse_tesseract_tsv(tsv_content: &str) -> Result<OcrResult, String> {
    let mut words: Vec<String> = Vec::new();
    let mut boxes: Vec<OcrBoundingBox> = Vec::new();

    let mut lines = tsv_content.lines();
    // Verify or skip header line
    let _header = lines.next();

    for line in lines {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 12 {
            continue;
        }

        let left_str = cols[6].trim();
        let top_str = cols[7].trim();
        let width_str = cols[8].trim();
        let height_str = cols[9].trim();
        let conf_str = cols[10].trim();
        let text_str = cols[11].trim();

        // Skip empty text tokens or structural container rows (level < 5 usually have conf -1 or empty text)
        if text_str.is_empty() {
            continue;
        }

        let conf: f64 = conf_str.parse().unwrap_or(-1.0);
        if conf < 0.0 {
            continue;
        }

        let left: i32 = left_str.parse().unwrap_or(0);
        let top: i32 = top_str.parse().unwrap_or(0);
        let width: i32 = width_str.parse().unwrap_or(0);
        let height: i32 = height_str.parse().unwrap_or(0);

        let bbox = OcrBoundingBox {
            x0: left,
            y0: top,
            x1: left + width,
            y1: top + height,
            conf,
            word: text_str.to_string(),
        };

        words.push(text_str.to_string());
        boxes.push(bbox);
    }

    let full_text = words.join(" ");

    Ok(OcrResult {
        text: full_text,
        boxes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tsv_fixture() {
        let tsv_fixture = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
1\t1\t0\t0\t0\t0\t0\t0\t1280\t720\t-1\t\n\
2\t1\t1\t0\t0\t0\t25\t500\t1230\t150\t-1\t\n\
3\t1\t1\t1\t0\t0\t25\t500\t1230\t150\t-1\t\n\
4\t1\t1\t1\t1\t0\t25\t500\t800\t40\t-1\t\n\
5\t1\t1\t1\t1\t1\t25\t500\t180\t35\t96.5\tBREAKING\n\
5\t1\t1\t1\t1\t2\t215\t500\t110\t35\t94.2\tNEWS:\n\
5\t1\t1\t1\t1\t3\t335\t500\t240\t35\t89.8\tMARKET\n\
5\t1\t1\t1\t1\t4\t585\t500\t240\t35\t92.1\tUPDATE";

        let parsed = parse_tesseract_tsv(tsv_fixture).expect("Failed to parse fixture TSV");

        assert_eq!(parsed.text, "BREAKING NEWS: MARKET UPDATE");
        assert_eq!(parsed.boxes.len(), 4);

        assert_eq!(parsed.boxes[0].word, "BREAKING");
        assert_eq!(parsed.boxes[0].x0, 25);
        assert_eq!(parsed.boxes[0].y0, 500);
        assert_eq!(parsed.boxes[0].x1, 205);
        assert_eq!(parsed.boxes[0].y1, 535);
        assert_eq!(parsed.boxes[0].conf, 96.5);

        assert_eq!(parsed.boxes[1].word, "NEWS:");
        assert_eq!(parsed.boxes[1].x0, 215);
        assert_eq!(parsed.boxes[1].x1, 325);

        assert_eq!(parsed.boxes[3].word, "UPDATE");
        assert_eq!(parsed.boxes[3].conf, 92.1);
    }

    #[test]
    fn test_empty_tsv() {
        let empty_fixture = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n";
        let parsed = parse_tesseract_tsv(empty_fixture).expect("Should handle empty TSV");
        assert_eq!(parsed.text, "");
        assert!(parsed.boxes.is_empty());
    }
}
