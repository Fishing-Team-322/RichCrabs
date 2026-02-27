#pragma once

#include <openssl/rand.h>

#include <array>
#include <cstdint>
#include <stdexcept>
#include <string>

namespace util {
namespace detail {

inline std::string random_from_charset(std::size_t len, const char* charset, std::size_t charset_size) {
  if (charset_size == 0) return "";

  constexpr std::size_t kChunkSize = 64;
  const auto limit = static_cast<uint8_t>(UINT8_MAX - ((UINT8_MAX + 1u) % charset_size));

  std::string out;
  out.reserve(len);

  while (out.size() < len) {
    std::array<unsigned char, kChunkSize> buffer{};
    if (RAND_bytes(buffer.data(), static_cast<int>(buffer.size())) != 1) {
      throw std::runtime_error("CSPRNG failure: RAND_bytes");
    }

    for (unsigned char value : buffer) {
      if (value > limit) continue;
      out.push_back(charset[value % charset_size]);
      if (out.size() == len) break;
    }
  }

  return out;
}

}  // namespace detail

inline std::string random_alnum_upper(std::size_t len) {
  static constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return detail::random_from_charset(len, alphabet, sizeof(alphabet) - 1);
}

inline std::string random_hex(std::size_t len) {
  static constexpr char hex[] = "0123456789abcdef";
  return detail::random_from_charset(len, hex, sizeof(hex) - 1);
}

}  // namespace util
