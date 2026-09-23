ALTER TABLE idea_cards ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idea_cards_exploration_position_idx
  ON idea_cards(exploration_run_id, position, id);
