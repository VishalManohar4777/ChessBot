cmake_minimum_required(VERSION 3.15)
project(ChessEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Optimization flags for stronger/faster play
if(MSVC)
    add_compile_options(/O2 /W3)
else()
    add_compile_options(-O2 -Wall -Wextra)
endif()

file(GLOB SOURCES "src/*.cpp")
add_executable(chess ${SOURCES})
