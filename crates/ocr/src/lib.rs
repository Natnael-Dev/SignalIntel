//! SignalIntel OCR & Visual Document Engine
//! High-throughput OCR bindings and visual ticker extraction.

pub mod tsv;

pub use tsv::{parse_tesseract_tsv, OcrBoundingBox, OcrResult};
