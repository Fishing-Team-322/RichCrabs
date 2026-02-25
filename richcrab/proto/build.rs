fn main() {
    println!("cargo:rerun-if-changed=proto/richcrab.proto");
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(&["proto/richcrab.proto"], &["proto"])
        .expect("failed to compile proto definitions");
}
