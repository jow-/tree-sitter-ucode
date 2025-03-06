package tree_sitter_ucode_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_ucode "github.com/jow-/ucode/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_ucode.Language())
	if language == nil {
		t.Errorf("Error loading Ucode grammar")
	}
}
