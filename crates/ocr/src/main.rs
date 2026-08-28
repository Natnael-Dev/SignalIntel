//! SignalIntel OCR CLI (xberg-inspired Tesseract TSV Bridge)
//!
//! Executes the system Tesseract OCR engine on target images/regions,
//! parses word-level TSV bounding boxes, and prints JSON to stdout.

use std::env;
use std::path::Path;
use std::process::{Command, ExitCode};

mod tsv;
pub use tsv::{parse_tesseract_tsv, OcrBoundingBox, OcrResult};

const EXIT_SUCCESS: u8 = 0;
const EXIT_GENERAL_ERROR: u8 = 1;
const EXIT_USAGE_ERROR: u8 = 2;
const EXIT_TESSERACT_NOT_FOUND: u8 = 3;

fn print_json_error(error_code: &str, details: Option<&str>) {
    let json_output = match details {
        Some(d) => format!(r#"{{"error":"{}","details":"{}"}}"#, error_code, d.replace('"', "\\\"")),
        None => format!(r#"{{"error":"{}"}}"#, error_code),
    };
    eprintln!("{}", json_output);
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();

    let mut image_path: Option<String> = None;
    let mut lang = "eng".to_string();

    let mut idx = 1;
    while idx < args.len() {
        match args[idx].as_str() {
            "--image" | "-i" => {
                if idx + 1 < args.len() {
                    image_path = Some(args[idx + 1].clone());
                    idx += 2;
                } else {
                    idx += 1;
                }
            }
            "--lang" | "-l" => {
                if idx + 1 < args.len() {
                    lang = args[idx + 1].clone();
                    idx += 2;
                } else {
                    idx += 1;
                }
            }
            "--help" | "-h" => {
                println!("Usage: signalintel-ocr --image <path> [--lang eng]");
                return ExitCode::from(EXIT_SUCCESS);
            }
            _ => {
                idx += 1;
            }
        }
    }

    let target_image = match image_path {
        Some(p) => p,
        None => {
            print_json_error("INVALID_ARGUMENTS", Some("Missing required --image argument"));
            return ExitCode::from(EXIT_USAGE_ERROR);
        }
    };

    if !Path::new(&target_image).exists() {
        print_json_error("IMAGE_NOT_FOUND", Some(&target_image));
        return ExitCode::from(EXIT_GENERAL_ERROR);
    }

    // Attempt to execute tesseract binary with TSV output
    let tesseract_cmd = Command::new("tesseract")
        .arg(&target_image)
        .arg("stdout")
        .arg("-l")
        .arg(&lang)
        .arg("tsv")
        .output();

    let output = match tesseract_cmd {
        Ok(out) => out,
        Err(err) => {
            // Tesseract binary missing from system PATH
            if err.kind() == std::io::ErrorKind::NotFound {
                print_json_error("TESSERACT_NOT_FOUND", None);
                return ExitCode::from(EXIT_TESSERACT_NOT_FOUND);
            } else {
                print_json_error("TESSERACT_SPAWN_ERROR", Some(&err.to_string()));
                return ExitCode::from(EXIT_GENERAL_ERROR);
            }
        }
    };

    if !output.status.success() {
        let stderr_msg = String::from_utf8_lossy(&output.stderr);
        print_json_error("TESSERACT_EXECUTION_FAILED", Some(stderr_msg.trim()));
        return ExitCode::from(EXIT_GENERAL_ERROR);
    }

    let stdout_tsv = String::from_utf8_lossy(&output.stdout);
    match parse_tesseract_tsv(&stdout_tsv) {
        Ok(ocr_result) => {
            match serde_json::to_string(&ocr_result) {
                Ok(json_str) => {
                    println!("{}", json_str);
                    ExitCode::from(EXIT_SUCCESS)
                }
                Err(err) => {
                    print_json_error("JSON_SERIALIZE_ERROR", Some(&err.to_string()));
                    ExitCode::from(EXIT_GENERAL_ERROR)
                }
            }
        }
        Err(err) => {
            print_json_error("TSV_PARSE_ERROR", Some(&err));
            ExitCode::from(EXIT_GENERAL_ERROR)
        }
    }
}
