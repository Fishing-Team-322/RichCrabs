fn main() {
    println!("cargo:rerun-if-changed=proto");

    let protoc = protoc_bin_vendored::protoc_bin_path().expect("failed to find protoc");
    std::env::set_var("PROTOC", protoc);
    let protoc_include =
        protoc_bin_vendored::include_path().expect("failed to find protoc include");

    let protos = [
        "proto/common.proto",
        "proto/events.proto",
        "proto/game.proto",
        "proto/join.proto",
        "proto/quiz.proto",
        "proto/entitlements.proto",
        "proto/bot.proto",
        "proto/richcrab.proto",
    ];

    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(
            &protos,
            &[std::path::Path::new("proto"), protoc_include.as_path()],
        )
        .expect("failed to compile proto definitions");
}
