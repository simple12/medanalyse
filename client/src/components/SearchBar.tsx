import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
}

export function SearchBar({ value, onChange, onSearch, onClear }: SearchBarProps) {
  return (
    <form
      className="flex flex-1 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search patients by name..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Search patients by name"
        />
      </div>
      <Button type="submit">Search</Button>
      {value && (
        <Button type="button" variant="outline" onClick={onClear}>
          Clear
        </Button>
      )}
    </form>
  );
}
