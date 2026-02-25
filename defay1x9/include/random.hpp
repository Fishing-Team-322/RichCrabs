#pragma once
#include <random>
#include <string>

namespace util {

inline std::string random_alnum_upper(std::size_t len) {
  static constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  thread_local std::mt19937 rng{std::random_device{}()};
  std::uniform_int_distribution<std::size_t> dist(0, sizeof(alphabet) - 2);

  std::string out;
  out.reserve(len);
  for (std::size_t i = 0; i < len; ++i) out.push_back(alphabet[dist(rng)]);
  return out;
}

inline std::string random_hex(std::size_t len) {
  static constexpr char hex[] = "0123456789abcdef";
  thread_local std::mt19937 rng{std::random_device{}()};
  std::uniform_int_distribution<std::size_t> dist(0, sizeof(hex) - 2);

  std::string out;
  out.reserve(len);
  for (std::size_t i = 0; i < len; ++i) out.push_back(hex[dist(rng)]);
  return out;
}

} // namespace util