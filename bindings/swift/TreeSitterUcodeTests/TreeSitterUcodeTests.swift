import XCTest
import SwiftTreeSitter
import TreeSitterUcode

final class TreeSitterUcodeTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_ucode())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Ucode grammar")
    }
}
